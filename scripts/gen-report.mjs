import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function renderReport() {
    let report = "# REAL-WORLD AGENT VALIDATION REPORT\n\n";
    
    // Summary
    const accts = await prisma.account.findMany();
    const pCount = await prisma.product.count();
    const tCount = await prisma.agentTask.count();
    
    report += "## STEP 1: SYNC RESULTS\n";
    report += `**Total Products Synced:** ${pCount}\n`;
    report += "**Accounts Synced:**\n";
    accts.forEach(a => report += `- ${a.name}\n`);
    
    // Agent Summary
    const runSummary = await prisma.$queryRawUnsafe(`
        SELECT agent_name, COUNT(*) as tasks, 
               SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as c_tasks,
               SUM(CASE WHEN severity = 'HIGH' THEN 1 ELSE 0 END) as h_tasks,
               SUM(CASE WHEN severity = 'MODERATE' THEN 1 ELSE 0 END) as m_tasks
        FROM AgentTask
        GROUP BY agent_name
    `);
    
    report += "\n## STEP 3: REAL RESULTS\n";
    for (let r of runSummary) {
        report += `### ${r.agent_name}\n`;
        report += `- Total Tasks Generated: ${r.tasks}\n`;
        report += `- Critical Tasks: ${Number(r.c_tasks)}\n`;
        report += `- High Tasks: ${Number(r.h_tasks)}\n`;
        report += `- Moderate Tasks: ${Number(r.m_tasks)}\n\n`;
    }

    // Agent 1
    report += "## AGENT #1 VALIDATION (Sample 10)\n";
    const agent1Tasks = await prisma.$queryRawUnsafe(`
        SELECT t.*, p.sku, p.name 
        FROM AgentTask t 
        JOIN Product p ON t.product_id = p.id 
        WHERE t.agent_name = 'NIGHTLY_SEO'
        LIMIT 10
    `);
    for (let t of agent1Tasks) {
        report += `**SKU:** ${t.sku}\n`;
        report += `**Product Name:** ${t.name}\n`;
        report += `**Problem Detected:** ${t.what_is_wrong}\n`;
        report += `**Why It Was Flagged:** ${t.why_is_wrong}\n`;
        report += `**Suggested Fix:** ${t.suggested_value}\n`;
        report += `**Expected Benefit:** ${t.expected_benefit}\n`;
        report += `**Risk Level:** ${t.risk_level}\n\n`;
    }

    // Agent 5
    report += "## AGENT #5 VALIDATION (Sample 10)\n";
    const agent5Tasks = await prisma.$queryRawUnsafe(`
        SELECT t.*, p.sku, p.name, p.content_rating 
        FROM AgentTask t 
        JOIN Product p ON t.product_id = p.id 
        WHERE t.agent_name = 'CONTENT_RATING'
        LIMIT 10
    `);
    for (let t of agent5Tasks) {
        report += `**SKU:** ${t.sku}\n`;
        report += `**Current Content Rating:** ${t.content_rating}%\n`;
        report += `**Missing Attributes/Images:** ${t.what_is_wrong}\n`;
        report += `**Description Problems:** ${t.suggested_value}\n`;
        report += `**Expected Rating Improvement:** ${t.expected_benefit}\n\n`;
    }

    // Agent 6
    report += "## AGENT #6 VALIDATION\n";
    const agent6Tasks = await prisma.$queryRawUnsafe(`
        SELECT t.*, p.sku, p.name
        FROM AgentTask t 
        JOIN Product p ON t.product_id = p.id 
        WHERE t.agent_name = 'LISTING_ERROR'
        LIMIT 5
    `);
    for (let t of agent6Tasks) {
        report += `**SKU:** ${t.sku}\n`;
        report += `**Error Type:** ${t.what_is_wrong}\n`;
        report += `**Why It Was Blocked:** ${t.why_is_wrong}\n`;
        report += `**Severity:** ${t.severity}\n\n`;
    }

    // Approval Queue Detail Check
    report += "## APPROVAL QUEUE VALIDATION\n";
    const queueSample = await prisma.$queryRawUnsafe(`
        SELECT * FROM AgentTask ORDER BY created_at DESC LIMIT 5
    `);
    queueSample.forEach(t => {
        report += `### Task ID: ${t.id}\n`;
        report += `- **What Is Wrong?** ${t.what_is_wrong}\n`;
        report += `- **Why Is It Wrong?** ${t.why_is_wrong}\n`;
        report += `- **What Exact Value Should Be Used?** ${t.suggested_value}\n`;
        report += `- **Expected Improvement?** ${t.expected_benefit}\n`;
        report += `- **Safe To Apply?** ${t.safe_to_auto ? 'Yes' : 'No'}\n`;
        report += `- **Risk Level?** ${t.risk_level}\n\n`;
    });

    fs.writeFileSync('C:\\Users\\SONI PRAJAPATI\\.gemini\\antigravity\\brain\\bb48fc8f-8825-4e86-8cf5-cd92f1a8f62b\\real_world_validation_report.md', report);
    console.log("Report generated at real_world_validation_report.md");
}

renderReport().catch(console.error).finally(()=>prisma.$disconnect());
