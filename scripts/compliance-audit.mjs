import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

const MEDICAL_TERMS = [
    'от похмелья', // from hangover
    'от простуды', // from cold
    'лечит',       // cures
    'лечение',     // treatment
    'устраняет',   // eliminates (disease)
    'против болезни', // against disease
    'cure', 
    'treats',
    'heals',
    'medical',
    'заболевание', // disease
    'грипп',       // flu
    'инфекция',    // infection
    'боль'         // pain
];

async function runAudit() {
    console.log('Starting Compliance Audit...');
    const products = await prisma.product.findMany({
        where: {
            OR: [
                { name: { contains: ' ' } }, // dummy to fetch all, optimize below
            ]
        }
    });

    let flaggedProducts = [];

    for (const p of products) {
        const textToScan = (p.name + " " + (p.attributes_json || '')).toLowerCase();
        let foundTerms = [];
        
        for (const term of MEDICAL_TERMS) {
            if (textToScan.includes(term.toLowerCase())) {
                foundTerms.push(term);
            }
        }

        if (foundTerms.length > 0) {
            // Generate a suggested safe alternative (naive rule-based for this audit output)
            let safeName = p.name;
            let replacementReason = [];
            
            if (foundTerms.includes('от похмелья')) {
                safeName = safeName.replace(/от похмелья/gi, 'для поддержки после вечеринки (for post-party support)');
                replacementReason.push("Replaced hangover cure with wellness support");
            }
            if (foundTerms.includes('от простуды')) {
                safeName = safeName.replace(/от простуды/gi, 'для согревания (for warming/comfort)');
                replacementReason.push("Replaced cold cure with physical comfort/warming");
            }
            if (foundTerms.includes('лечит') || foundTerms.includes('лечение')) {
                safeName = safeName.replace(/лечение|лечит/gi, 'уход (care)');
                replacementReason.push("Replaced treatment/cure with care/maintenance");
            }
            if (foundTerms.includes('боль')) {
                safeName = safeName.replace(/боль|головной боли/gi, 'напряжения (tension)');
                replacementReason.push("Replaced pain relief with tension relief");
            }

            // Fallback generic 
            if (safeName === p.name) {
                safeName = "[Requires Manual Content Rewrite - Remove Medical Claim]";
                replacementReason.push(`Contains banned terms: ${foundTerms.join(', ')}`);
            }

            flaggedProducts.push({
                sku: p.sku,
                name: p.name,
                risk: 'CRITICAL (Account Suspension Risk)',
                reason: `Contains banned medical claims: ${foundTerms.join(', ')}`,
                suggested_safe: safeName,
                notes: replacementReason.join(' | ')
            });
        }
    }

    let report = "# MEDICAL COMPLIANCE AUDIT REPORT\n\n";
    report += `**Total Products Scanned:** ${products.length}\n`;
    report += `**Products Flagged for Medical Claims:** ${flaggedProducts.length}\n\n`;
    
    // Sample up to 20 for the output report
    const sample = flaggedProducts.slice(0, 20);
    for (const f of sample) {
        report += `### SKU: ${f.sku}\n`;
        report += `- **Original Name:** ${f.name}\n`;
        report += `- **Risk Level:** ${f.risk}\n`;
        report += `- **Reason Flagged:** ${f.reason}\n`;
        report += `- **Suggested Safe Alternative:** ${f.suggested_safe}\n`;
        report += `- **Compliance Action:** ${f.notes}\n\n`;
    }

    fs.writeFileSync('C:\\Users\\SONI PRAJAPATI\\.gemini\\antigravity\\brain\\bb48fc8f-8825-4e86-8cf5-cd92f1a8f62b\\compliance_audit_report.md', report);
    console.log(`Audit complete! Flagged ${flaggedProducts.length} items.`);
}

runAudit().catch(console.error).finally(()=>prisma.$disconnect());
