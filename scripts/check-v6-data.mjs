import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const [wf, seo, wfSample, seoSample] = await Promise.all([
    p.$queryRawUnsafe('SELECT COUNT(*) as c FROM ProductWorkflow'),
    p.$queryRawUnsafe('SELECT COUNT(*) as c FROM SEOAnalysis'),
    p.$queryRawUnsafe('SELECT amazon_status, compliance_status, groq_seo_status, cost_calc_status, expected_margin, roi FROM ProductWorkflow LIMIT 1'),
    p.$queryRawUnsafe('SELECT score_total, score_russian_keywords, score_image_quality, score_title_quality, russian_kw_missing, missing_attributes FROM SEOAnalysis LIMIT 1'),
]);
console.log('Workflow rows:', wf[0].c);
console.log('SEO rows:', seo[0].c);
console.log('Sample WF:', JSON.stringify(wfSample[0], null, 2));
console.log('Sample SEO:', JSON.stringify(seoSample[0], null, 2));
await p.$disconnect();
