import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const rawCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM AgentTask`);
    console.log('Raw DB Count:', Number(rawCount[0].c));
}
check().finally(() => prisma.$disconnect());
