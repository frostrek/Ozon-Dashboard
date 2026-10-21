import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkFailures() {
    const runs = await prisma.agentRun.findMany({ orderBy: { started_at: 'desc' }, take: 9 });
    console.log(runs);
}
checkFailures().finally(() => prisma.$disconnect());
