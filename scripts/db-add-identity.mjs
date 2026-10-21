import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Adding ProductIdentity table...");
        
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "ProductIdentity" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "account_id" TEXT NOT NULL,
                "client_id" TEXT NOT NULL,
                "account_name" TEXT,
                "product_id" TEXT NOT NULL,
                "sku" TEXT,
                "offer_id" TEXT NOT NULL,
                "article_code" TEXT,
                "barcode" TEXT,
                "brand" TEXT,
                "category" TEXT,
                "created_at" TEXT,
                "last_sync_at" TEXT
            );
        `);

        // Creates indexes carefully, ignoring if they exist
        try { await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "ProductIdentity_product_id_key" ON "ProductIdentity"("product_id");`); } catch (e) {}
        try { await prisma.$executeRawUnsafe(`CREATE INDEX "ProductIdentity_offer_id_idx" ON "ProductIdentity"("offer_id");`); } catch (e) {}
        try { await prisma.$executeRawUnsafe(`CREATE INDEX "ProductIdentity_sku_idx" ON "ProductIdentity"("sku");`); } catch (e) {}
        try { await prisma.$executeRawUnsafe(`CREATE INDEX "ProductIdentity_barcode_idx" ON "ProductIdentity"("barcode");`); } catch (e) {}
        try { await prisma.$executeRawUnsafe(`CREATE INDEX "ProductIdentity_account_id_idx" ON "ProductIdentity"("account_id");`); } catch (e) {}

        console.log("ProductIdentity table added successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
