import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    await prisma.errorLog.deleteMany({ where: { product_id: { startsWith: 'mock-' } }});
    await prisma.agentTask.deleteMany({ where: { product_id: { startsWith: 'mock-' } }});
    await prisma.product.deleteMany({ where: { id: { startsWith: 'mock-' } }});
    
    // Check real products and accounts
    const pCount = await prisma.product.count();
    const accts = await prisma.account.findMany();
    
    console.log('Total real products:', pCount);
    console.log('Accounts:');
    accts.forEach(a => console.log(`- ${a.name} [ID: ${a.id}]`));
    
    // Also, if the user requested Agent #11 logic, let's verify if ErrorLogs have data.
    const eCount = await prisma.errorLog.count();
    console.log('Total error logs:', eCount);
}

run().catch(console.error).finally(() => prisma.$disconnect());
