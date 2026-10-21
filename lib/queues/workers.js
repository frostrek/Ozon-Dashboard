import { Worker, UnrecoverableError } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { addJobToQueue } from './config.js';

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
};

const prisma = new PrismaClient();

// Helper to log execution centrally
async function logAgentExecution(workflow_id, product_id, agent_name, input, output, ms, status, error = null, retry_count = 0) {
    try {
        await prisma.agentExecutionLog.create({
            data: {
                workflow_id,
                product_id,
                agent_name,
                status,
                input_payload: JSON.stringify(input),
                output_payload: JSON.stringify(output),
                execution_ms: ms,
                retry_count,
                error_message: error?.message || null
            }
        });
    } catch (e) {
        console.error('[ExecutionLog Failed]', e.message);
    }
}

// ─── Network/Retry Safety Logic ─────────────────────────────────────────────
function handleAgentError(err, job) {
    const msg = err.message || '';
    const code = err.status || err.statusCode || (msg.match(/(\d{3})/) || [])[0];

    // Non-Retryable Validation Errors (Move straight to DLQ / Failed)
    if (['400', '401', '403', '404'].includes(String(code)) || msg.toLowerCase().includes('validation')) {
        job.discard(); // Tell BullMQ never to retry this
        throw new UnrecoverableError(`Validation/Auth Error - Sent to DLQ: ${msg}`);
    }
    
    // Transient Errors (429, 50x, Network Timeout)
    throw err;
}

// ─── Worker Factory ────────────────────────────────────────────────────────
async function createWorkflowWorker(queueName, agentKey, agentName, nextQueueName, processFn, concurrency = 10) {
    return new Worker(queueName, async (job) => {
        const start = Date.now();
        const { product_id, workflow_id } = job.data;
        
        try {
            await prisma.workflowState.update({
                where: { product_id },
                data: { status: 'RUNNING', [agentKey + '_status']: 'RUNNING', current_agent: agentName }
            });
            
            // Execute Agent Business Logic
            const result = await processFn(job);
            
            await prisma.workflowState.update({
                where: { product_id },
                data: { [agentKey + '_status']: 'COMPLETE', [agentKey + '_completed_at']: new Date().toISOString() }
            });
            
            await logAgentExecution(workflow_id, product_id, agentName, { product_id }, result, Date.now() - start, 'SUCCESS', null, job.attemptsMade);
            
            // Progress to next queue in sequence
            if (nextQueueName) {
                await addJobToQueue(nextQueueName, { product_id, workflow_id });
            } else {
                await prisma.workflowState.update({ where: { product_id }, data: { status: 'COMPLETE' }});
            }
            
            return result;
        } catch (err) {
            await prisma.workflowState.update({
                where: { product_id },
                data: { [agentKey + '_status']: 'FAILED', failed_agent: agentName, retry_count: { increment: 1 } }
            });
            await logAgentExecution(workflow_id, product_id, agentName, { product_id }, null, Date.now() - start, 'FAILED', err, job.attemptsMade);
            
            // Process Retry / Dead Letter Queue Policy
            handleAgentError(err, job);
        }
    }, { connection, concurrency });
}

// ─── Bootstrapper ──────────────────────────────────────────────────────────
export async function startWorkers() {
    // 1. Fetch live AI Settings for dynamic concurrency
    const settings = await prisma.aISettings.findUnique({ where: { id: 'GLOBAL' } }) || { queue_concurrency: 50 };
    const baseConcurrency = settings.queue_concurrency;

    // Define the orchestrated queue sequence (Phase 4 Specification)
    const pipeline = [
        { q: 'amazon-reference-queue',     k: 'amazon',      n: 'AMAZON_CROSS_REFERENCE', c: Math.round(baseConcurrency * 0.5) || 25 },
        { q: 'compliance-queue',           k: 'compliance',  n: 'COMPLIANCE',             c: Math.round(baseConcurrency * 1.0) || 50 },
        { q: 'groq-seo-queue',             k: 'groq_seo',    n: 'GROQ_SEO',               c: Math.round(baseConcurrency * 0.2) || 10 },
        { q: 'listing-optimization-queue', k: 'listing_opt', n: 'LISTING_OPTIMIZATION',   c: baseConcurrency },
        { q: 'competitor-pricing-queue',   k: 'competitor',  n: 'COMPETITOR_PRICING',     c: Math.round(baseConcurrency * 0.4) || 20 },
        { q: 'cost-calculator-queue',      k: 'cost_calc',   n: 'COST_CALCULATOR',        c: baseConcurrency },
        { q: 'approval-queue',             k: 'approval',    n: 'APPROVAL_GATE',          c: baseConcurrency },
        { q: 'push-to-ozon-queue',         k: 'ozon_push',   n: 'OZON_PUSH',              c: Math.round(baseConcurrency * 0.5) || 25 },
        { q: 'verification-queue',         k: 'verify',      n: 'VERIFICATION',           c: Math.round(baseConcurrency * 0.3) || 15 },
        { q: 'reanalysis-queue',           k: 'reanalysis',  n: 'REANALYSIS',             c: baseConcurrency }
    ];

    const workers = [];

    for (let i = 0; i < pipeline.length; i++) {
        const step = pipeline[i];
        const nextStep = pipeline[i + 1] ? pipeline[i + 1].q : null;
        
        workers.push(await createWorkflowWorker(step.q, step.k, step.n, nextStep, async (job) => {
            // Placeholder: Actual LangGraph Executor invokes business rules here
            return { executed: step.n, product_id: job.data.product_id };
        }, step.c));
    }

    console.log(`[BullMQ] 10 Central Execution Workers started. Total theoretical concurrency capacity: ${pipeline.reduce((acc,s)=>acc+s.c, 0)} jobs/tick.`);
}
