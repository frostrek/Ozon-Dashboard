import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const rows = await p.$queryRawUnsafe(`
    SELECT
        lo.id AS lo_id, lo.product_id, lo.priority,
        p.name AS product_name,
        wf.amazon_status, wf.compliance_status,
        seo.score_total AS seo_score_total
    FROM ListingOptimization lo
    LEFT JOIN Product p ON p.id = lo.product_id
    LEFT JOIN ProductWorkflow wf ON wf.product_id = lo.product_id
    LEFT JOIN SEOAnalysis seo ON seo.product_id = lo.product_id
    LIMIT 2
`);
console.log(rows);
await p.$disconnect();
