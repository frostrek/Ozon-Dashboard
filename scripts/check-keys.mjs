import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const wf = await p.$queryRawUnsafe('SELECT * FROM ProductWorkflow LIMIT 1');
console.log('WF Object Keys:', Object.keys(wf[0] || {}));
await p.$disconnect();
