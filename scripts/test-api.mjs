import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const _lo = await prisma.$queryRawUnsafe(`SELECT * FROM ListingOptimization LIMIT 1`);
    console.log(_lo[0]);
    await prisma.$disconnect();
}
run();
