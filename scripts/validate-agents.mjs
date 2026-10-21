import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const accts = await prisma.account.findMany();
    // Let's run for Frostreck LLP
    const frostreck = accts.find(a => a.name === 'Frostreck LLP');
    
    if (!frostreck) {
        console.log("Waiting for Frostreck sync to finish...");
        return;
    }
    
    console.log(`Starting Agents for ${frostreck.name} [ID: ${frostreck.id}]`);
    
    const baseUrl = 'http://localhost:3000';
    
    // 1. NIGHTLY SEO AGENT
    console.log("Running Nightly SEO Agent...");
    const seoRes = await fetch(`${baseUrl}/api/agents/nightly-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: frostreck.id, limit: 1000 }) // using limit 1000 to keep it fast
    });
    const seoData = await seoRes.json();
    console.log("Nightly SEO Result:", seoData);
    
    // 2. CONTENT RATING AGENT
    console.log("Running Content Rating Agent...");
    const crRes = await fetch(`${baseUrl}/api/agents/content-rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: frostreck.id, threshold: 80 })
    });
    const crData = await crRes.json();
    console.log("Content Rating Result:", crData);
    
    // 3. LISTING ERROR AGENT
    console.log("Running Listing Error Agent...");
    const errRes = await fetch(`${baseUrl}/api/agents/listing-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: frostreck.id })
    });
    const errData = await errRes.json();
    console.log("Listing Error Result:", errData);
    
    console.log("\n=================================================");
    console.log("AGENT #1 VALIDATION (Sample 10 tasks)");
    console.log("=================================================");
    const agent1Tasks = await prisma.$queryRawUnsafe(`
        SELECT t.*, p.sku, p.name 
        FROM AgentTask t 
        JOIN Product p ON t.product_id = p.id 
        WHERE t.agent_name = 'NIGHTLY_SEO' 
        LIMIT 10
    `);
    
    for (let t of agent1Tasks) {
        console.log(`\nSKU: ${t.sku}`);
        console.log(`Product Name: ${t.name}`);
        console.log(`Problem Detected: ${t.what_is_wrong}`);
        console.log(`Why It Was Flagged: ${t.why_is_wrong}`);
        console.log(`Suggested Fix: ${t.suggested_value}`);
        console.log(`Expected Benefit: ${t.expected_benefit}`);
        console.log(`Risk Level: ${t.risk_level}`);
    }

    console.log("\n=================================================");
    console.log("AGENT #5 VALIDATION (Sample 10 tasks)");
    console.log("=================================================");
    const agent5Tasks = await prisma.$queryRawUnsafe(`
        SELECT t.*, p.sku, p.name, p.content_rating 
        FROM AgentTask t 
        JOIN Product p ON t.product_id = p.id 
        WHERE t.agent_name = 'CONTENT_RATING' 
        LIMIT 10
    `);
    
    for (let t of agent5Tasks) {
        console.log(`\nSKU: ${t.sku}`);
        console.log(`Current Content Rating: ${t.content_rating}%`);
        console.log(`Problem Detected: ${t.what_is_wrong}`);
        console.log(`Missing Details: ${t.suggested_value}`);
        console.log(`Expected Rating Improvement: ${t.expected_benefit.split(' ')[0]}`);
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
