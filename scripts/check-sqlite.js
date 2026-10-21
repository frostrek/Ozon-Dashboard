const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
    const tables = await p.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name');
    console.log('=== ALL TABLES ===');
    tables.forEach(t => console.log(t.name));
    
    // Row counts for important tables
    const counts = ['Product','ListingOptimization','SEOAnalysis','ProductWorkflow','AgentRun','AgentTask','AmazonReference'];
    for (const t of counts) {
        try {
            const r = await p.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM ' + t);
            console.log(t + ':', r[0].cnt);
        } catch(e) { console.log(t + ': table missing'); }
    }
    await p.$disconnect();
}
main();
