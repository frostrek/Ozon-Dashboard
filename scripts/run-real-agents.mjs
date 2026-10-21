import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function reRun() {
    console.log('Running API Trigger...');
    const baseUrl = 'http://localhost:3000';
    
    // Clean old tasks
    await prisma.agentTask.deleteMany({});
    await prisma.agentRun.deleteMany({});

    for (const acct of await prisma.account.findMany()) {
        if (acct.name.includes('Mock')) continue;
        console.log('Orchestrating Phase 1 for:', acct.name);
        
        try {
            const res = await fetch(`${baseUrl}/api/agents/run-all`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ accountId: acct.id })
            });
            const data = await res.json();
            console.log(acct.name, '=> Tasks:', data.total_tasks_created);
        } catch(e) {
            console.error('Failed for', acct.name, e);
        }
    }
}
reRun().finally(() => prisma.$disconnect());
