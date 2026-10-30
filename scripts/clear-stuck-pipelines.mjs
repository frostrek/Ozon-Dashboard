import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const result = await prisma.pipelineRun.updateMany({
  where: { status: 'running' },
  data: {
    status: 'failed',
    stage: 'failed',
    error_message: 'Cleared a stuck run so a new pipeline can start.',
    end_time: new Date(),
    pid: null,
  },
});
console.log(JSON.stringify({ cleared: result.count }));
await prisma.$disconnect();
