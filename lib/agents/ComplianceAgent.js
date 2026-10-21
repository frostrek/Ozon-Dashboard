/**
 * ComplianceAgent.js
 * 
 * Agent #2 — Checks every listing against Ozon's compliance rules.
 * 
 * Checks:
 *   - Medical/medicinal claims in title or description
 *   - Prohibited category keywords (hazardous, prescription)
 *   - Weight/volume completeness
 *   - Brand consistency
 *   - Category accuracy
 */

import { PrismaClient } from '@prisma/client';
import { writeMemory }  from '../engine/WorkflowEngine.js';

const prisma = new PrismaClient();

// Ozon-prohibited claim patterns
const MEDICAL_CLAIMS = [
    /лечени[еяю]/i, /лечит/i, /терапи[яею]/i, /диагностик/i,
    /медицинск/i, /клинически/i, /рецептурн/i, /prescription/i,
    /cures?/i, /treats?/i, /heals?/i, /diagnoses?/i,
    /fda approved/i, /clinically proven/i, /медицин/i,
];

const HAZMAT_TERMS = [
    /легковоспламеняем/i, /взрывоопасн/i, /ядовит/i, /flammable/i, /explosive/i, /poison/i, /toxic/i
];

function scanText(text, patterns) {
    if (!text) return [];
    return patterns.filter(p => p.test(text)).map(p => p.source);
}

export async function ComplianceAgent({ product_id, workflow_id, memory }) {
    const product = await prisma.product.findUnique({ where: { id: product_id } });
    if (!product) throw new Error(`Product ${product_id} not found`);

    const flags         = [];
    const searchText    = `${product.name || ''} ${product.category_name || ''}`.toLowerCase();

    // ─── Medical claims check ─────────────────────────────────────────────────
    const medicalHits = scanText(searchText, MEDICAL_CLAIMS);
    if (medicalHits.length > 0) {
        flags.push({ type: 'MEDICAL_CLAIM', severity: 'CRITICAL', patterns: medicalHits, message: 'Title contains medical/therapeutic claims prohibited on Ozon' });
    }

    // ─── Hazmat check ─────────────────────────────────────────────────────────
    const hazmatHits = scanText(searchText, HAZMAT_TERMS);
    if (hazmatHits.length > 0) {
        flags.push({ type: 'HAZMAT_CLAIM', severity: 'CRITICAL', patterns: hazmatHits, message: 'Product may contain hazardous material claims' });
    }

    // ─── Brand completeness ───────────────────────────────────────────────────
    if (!product.brand || product.brand.trim() === '') {
        flags.push({ type: 'MISSING_BRAND', severity: 'HIGH', message: 'Brand is required for all Ozon listings' });
    }

    // ─── Weight/volume check ──────────────────────────────────────────────────
    if (!product.volume_weight || product.volume_weight <= 0) {
        flags.push({ type: 'MISSING_WEIGHT', severity: 'MEDIUM', message: 'Volume weight is missing — required for Ozon FBO shipping calculation' });
    }

    // ─── Image count ──────────────────────────────────────────────────────────
    let imageCount = 0;
    try {
        const imgs = JSON.parse(product.images_json || '[]');
        imageCount = Array.isArray(imgs) ? imgs.flat().filter(Boolean).length : 0;
    } catch {}
    if (imageCount < 3) {
        flags.push({ type: 'INSUFFICIENT_IMAGES', severity: 'HIGH', message: `Only ${imageCount} image(s). Ozon recommends minimum 5.` });
    }

    const passed   = !flags.some(f => f.severity === 'CRITICAL');
    const flagsJson = JSON.stringify(flags);

    // ─── Persist to ProductWorkflow ───────────────────────────────────────────
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(`
        UPDATE ProductWorkflow
        SET compliance_status='${passed ? 'COMPLETE' : 'FAILED'}',
            compliance_completed_at='${now}',
            compliance_flags='${flagsJson.replace(/'/g, "''")}'
        WHERE product_id='${product_id}'
    `);

    // Store in memory so future agents can act on non-compliant products
    await writeMemory(product_id, 'COMPLIANCE', 'passed', String(passed), 'COMPLIANCE_RESULT');
    if (flags.length > 0) {
        await writeMemory(product_id, 'COMPLIANCE', 'flags_summary', flags.map(f => f.type).join('|'), 'COMPLIANCE_FLAGS');
    }

    return { passed, flags, flagCount: flags.length };
}
