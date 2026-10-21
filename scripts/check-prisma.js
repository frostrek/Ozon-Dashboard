const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
    const models = Object.getOwnPropertyNames(Object.getPrototypeOf(p))
        .filter(k => !k.startsWith('_') && !k.startsWith('$') && k !== 'constructor');
    console.log('Prisma client models:', models.join(', '));
    await p.$disconnect();
}
run().catch(e => console.error(e.message));
