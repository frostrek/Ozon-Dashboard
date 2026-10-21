/**
 * WorkflowEngine.js
 * 
 * LangGraph-style resumable workflow orchestrator.
 * Stage 1: SQLite-compatible, in-process queue.
 * Stage 3: Will be replaced by BullMQ + Redis workers.
 * 
 * Pipeline order (immutable):
 * 1. AmazonCrossReference
 * 2. Compliance
 * 3. GroqSEO
 * 4. ListingOptimization
 * 5. CompetitorPricing
 * 6. CostCalculator
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AGENT_ORDER = [
    'AMAZON_CROSS_REFERENCE',
    'COMPLIANCE',
    'GROQ_SEO',
    'LISTING_OPTIMIZATION',
    'COMPETITOR_PRICING',
    'COST_CALCULATOR',
];

// ─── State Helpers ────────────────────────────────────────────────────────────

export async function getOrCreateWorkflowState(product_id) {
    let state = await prisma.workflowState.findUnique({ where: { product_id } });
    if (!state) {
        state = await prisma.workflowState.create({
            data: { product_id }
        });
    }
    return state;
}

export async function advanceWorkflowState(product_id, completedAgent, agentKey) {
    const completed = AGENT_ORDER.slice(0, AGENT_ORDER.indexOf(completedAgent) + 1);
    const nextAgent = AGENT_ORDER[AGENT_ORDER.indexOf(completedAgent) + 1] || 'COMPLETE';
    const now = new Date().toISOString();

    const statusField = agentKey + '_status';
    const tsField     = agentKey + '_completed_at';

    await prisma.workflowState.update({
        where: { product_id },
        data: {
            current_agent:    nextAgent,
            completed_agents: JSON.stringify(completed),
            status:           nextAgent === 'COMPLETE' ? 'COMPLETE' : 'RUNNING',
            [statusField]:    'COMPLETE',
            [tsField]:        now,
            updated_at:       now,
        }
    });
    return nextAgent;
}

export async function markWorkflowFailed(product_id, failedAgent, agentKey, errorMessage) {
    const now = new Date().toISOString();
    const statusField = agentKey + '_status';
    await prisma.workflowState.upsert({
        where:  { product_id },
        create: { product_id, status: 'FAILED', failed_agent: failedAgent, [statusField]: 'FAILED', updated_at: now },
        update: { status: 'FAILED', failed_agent: failedAgent, [statusField]: 'FAILED', updated_at: now,
                  retry_count: { increment: 1 } }
    });
}

// ─── Execution Logger ─────────────────────────────────────────────────────────

export async function logExecution({ workflow_id, product_id, agent_name, status, input, output, ms, error, confidence }) {
    await prisma.agentExecutionLog.create({
        data: {
            workflow_id,
            product_id,
            agent_name,
            status,
            input_payload:    input  ? JSON.stringify(input)  : null,
            output_payload:   output ? JSON.stringify(output) : null,
            execution_ms:     ms,
            error_message:    error?.message || null,
            confidence_score: confidence || null,
            created_at:       new Date().toISOString(),
        }
    });
}

// ─── Memory Layer ─────────────────────────────────────────────────────────────

export async function readMemory(product_id, agent_name) {
    const memories = await prisma.agentMemory.findMany({
        where: { product_id, agent_name }
    });
    return memories.reduce((acc, m) => {
        acc[m.memory_key] = m.memory_value;
        return acc;
    }, {});
}

export async function writeMemory(product_id, agent_name, key, value, memory_type = 'GENERAL') {
    await prisma.agentMemory.upsert({
        where: { id: `${product_id}_${agent_name}_${key}`.replace(/[^a-z0-9_]/gi, '_').substring(0, 30) + '_mem' },
        create: { product_id, agent_name, memory_type, memory_key: key, memory_value: String(value), created_at: new Date().toISOString() },
        update: { memory_value: String(value) }
    });
}

// ─── Main Executor ────────────────────────────────────────────────────────────

/**
 * Run the full pipeline for one product, resuming from where it last stopped.
 * @param {string} product_id
 * @param {object} agents - { AMAZON_CROSS_REFERENCE: fn, COMPLIANCE: fn, ... }
 */
export async function executeWorkflow(product_id, agents) {
    const state = await getOrCreateWorkflowState(product_id);
    
    // Skip if already fully complete
    if (state.status === 'COMPLETE') return { skipped: true, reason: 'Already complete' };

    // Resume from current_agent (allows retry from failure point)
    const startIdx = AGENT_ORDER.indexOf(state.current_agent);
    if (startIdx === -1) return { skipped: true, reason: 'Invalid agent state' };

    const workflow_id = state.id;

    // Mark workflow as running
    await prisma.workflowState.update({
        where: { product_id },
        data: { status: 'RUNNING', updated_at: new Date().toISOString() }
    });

    for (let i = startIdx; i < AGENT_ORDER.length; i++) {
        const agentName = AGENT_ORDER[i];
        const agentKey  = agentName.toLowerCase().replace(/_/g, '_');
        const agentFn   = agents[agentName];

        if (!agentFn) {
            // No handler registered — skip this agent
            await advanceWorkflowState(product_id, agentName, agentKey);
            continue;
        }

        const start = Date.now();
        try {
            // Load any prior memory for this agent
            const memory = await readMemory(product_id, agentName);
            
            // Execute agent
            const result = await agentFn({ product_id, workflow_id, memory });
            const ms = Date.now() - start;
            
            // Log success
            await logExecution({ workflow_id, product_id, agent_name: agentName, status: 'SUCCESS', input: { product_id }, output: result, ms, confidence: result?.confidence });
            
            // Advance state
            await advanceWorkflowState(product_id, agentName, agentKey);

        } catch (err) {
            const ms = Date.now() - start;
            await logExecution({ workflow_id, product_id, agent_name: agentName, status: 'FAILED', input: { product_id }, output: null, ms, error: err });
            await markWorkflowFailed(product_id, agentName, agentKey, err.message);
            
            // Stop pipeline on failure — will resume from this agent next run
            return { failed: true, agent: agentName, error: err.message };
        }
    }

    return { complete: true };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process products in batches. Never loads all into memory.
 * @param {object} agents
 * @param {object} opts - { batchSize, limit, accountId, onlyFailed }
 */
export async function runBatch(agents, opts = {}) {
    const batchSize = opts.batchSize || 100;
    const limit     = opts.limit     || 500;
    let   offset    = 0;
    let   processed = 0;
    let   failed    = 0;

    // Build filter: resume from PENDING or FAILED workflows
    const statusFilter = opts.onlyFailed ? ['FAILED'] : ['PENDING', 'FAILED'];

    while (processed < limit) {
        // Fetch next batch of product IDs needing workflow
        const batch = await prisma.$queryRawUnsafe(`
            SELECT p.id FROM Product p
            LEFT JOIN WorkflowState ws ON ws.product_id = p.id
            WHERE ws.id IS NULL OR ws.status IN (${statusFilter.map(s => `'${s}'`).join(',')})
            ${opts.accountId ? `AND p.account_id = '${opts.accountId}'` : ''}
            LIMIT ${Math.min(batchSize, limit - processed)}
            OFFSET ${offset}
        `);

        if (!batch || batch.length === 0) break;

        // Run workflows concurrently within batch
        const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '10');
        for (let i = 0; i < batch.length; i += concurrency) {
            const chunk = batch.slice(i, i + concurrency);
            await Promise.allSettled(
                chunk.map(row => executeWorkflow(row.id, agents))
            );
        }

        processed += batch.length;
        offset    += batch.length;
        
        if (opts.onProgress) opts.onProgress({ processed, failed, total: limit });
    }

    return { processed, failed };
}
