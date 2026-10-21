const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
    const s = await p.aISettings.upsert({
        where:  { id: 'GLOBAL' },
        create: {
            id: 'GLOBAL',
            min_margin_pct: 15, min_match_confidence: 90, min_seo_score: 80,
            min_content_rating: 85, price_protection_pct: 5, auto_retry_count: 3,
            queue_concurrency: 50, groq_model: 'llama3-70b-8192',
            google_vision_model: 'gemini-1.5-pro-latest',
            amazon_scan_freq_hours: 168, competitor_scan_freq_hours: 24,
            updated_at: new Date().toISOString()
        },
        update: { updated_at: new Date().toISOString() }
    });
    console.log('AISettings seeded:', s.id);

    const wf = await p.workflowState.count();
    console.log('WorkflowState rows:', wf);

    const mem = await p.agentMemory.count();
    console.log('AgentMemory rows:', mem);

    const logs = await p.agentExecutionLog.count();
    console.log('AgentExecutionLog rows:', logs);

    const approvals = await p.workflowApproval.count();
    console.log('WorkflowApproval rows:', approvals);

    await p.$disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
