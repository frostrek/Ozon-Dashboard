import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Account names only. API keys stay in the local .env and are not stored in this file.
const ACCOUNTS = [
    { name: 'Frostreck LLP', client_id: process.env.SEED_FROSTRECK_CLIENT_ID, api_key: process.env.SEED_FROSTRECK_API_KEY },
    { name: 'Sunrise Luxury', client_id: process.env.SEED_SUNRISE_CLIENT_ID, api_key: process.env.SEED_SUNRISE_API_KEY },
    { name: 'Herbal Boutique', client_id: process.env.SEED_HERBAL_CLIENT_ID, api_key: process.env.SEED_HERBAL_API_KEY },
].filter((account) => account.client_id && account.api_key);

async function seed() {
    if (ACCOUNTS.length === 0) {
        console.log('No seed accounts configured. Set SEED_*_CLIENT_ID and SEED_*_API_KEY in the environment.');
        return;
    }
    console.log('Seeding accounts...');
    for (const acc of ACCOUNTS) {
        const existing = await prisma.account.findFirst({ where: { client_id: acc.client_id } });
        if (existing) {
            console.log(`  ✓ Already exists: ${acc.name}`);
        } else {
            await prisma.account.create({ data: { ...acc, active: true } });
            console.log(`  ✅ Created: ${acc.name}`);
        }
    }
    const total = await prisma.account.count();
    console.log(`\nDone. ${total} accounts in database.`);
}

seed().catch(console.error).finally(() => prisma.$disconnect());
