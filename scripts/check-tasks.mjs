import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testTasks() {
    const taskCount = await prisma.agentTask.count();
    console.log("Total tasks in DB:", taskCount);
    
    // Check if AgentRuns exist
    const runCount = await prisma.agentRun.count();
    console.log("Total runs in DB:", runCount);
}

testTasks().catch(console.error).finally(()=>prisma.$disconnect());
