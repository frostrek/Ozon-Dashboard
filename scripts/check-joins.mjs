import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Test each join independently
const lo = await p.$queryRawUnsafe('SELECT id, product_id, priority, seo_score, problem_count FROM ListingOptimization LIMIT 1');
console.log('LO row:', JSON.stringify(lo[0]));

const wf = await p.$queryRawUnsafe('SELECT product_id, amazon_status, compliance_status, groq_seo_status, cost_calc_status FROM ProductWorkflow LIMIT 1');
console.log('WF row:', JSON.stringify(wf[0]));

const seo = await p.$queryRawUnsafe('SELECT product_id, score_total, score_russian_keywords, score_image_quality FROM SEOAnalysis LIMIT 1');
console.log('SEO row:', JSON.stringify(seo[0]));

// check they share same product_id
const loId = lo[0]?.product_id;
const wfId = wf[0]?.product_id;
const seoId = seo[0]?.product_id;
console.log('\nLO product_id:', loId);
console.log('WF product_id:', wfId);
console.log('SEO product_id:', seoId);
console.log('Same?', loId === wfId, loId === seoId);

await p.$disconnect();
