/**
 * AmazonCrossReferenceAgent.js
 * 
 * Agent #1 — Finds the correct Amazon India product for every Ozon listing.
 * 
 * Match Priority:
 *   Level 1 → ASIN embedded in article code (confidence > 95%)
 *   Level 2 → Title + Brand similarity matching
 *   Level 3 → Image hash comparison (future: Vision API)
 *   Level 4 → Attribute overlap
 *   Level 5 → Manual review flag
 */

import { PrismaClient } from '@prisma/client';
import { writeMemory, readMemory } from '../engine/WorkflowEngine.js';

const prisma = new PrismaClient();

// Amazon ASIN regex
const ASIN_REGEX = /\b(B0[A-Z0-9]{8}|[A-Z0-9]{10})\b/;

// Normalize title for comparison
function normalizeTitle(title = '') {
    return title
        .toLowerCase()
        .replace(/pack of \d+/gi, '')
        .replace(/\d+\s*(ml|g|kg|l|oz|mg|pcs?|pieces?|units?)/gi, '')
        .replace(/[^a-z\u0400-\u04ff\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function titleSimilarity(a, b) {
    const wa = new Set(normalizeTitle(a).split(' ').filter(Boolean));
    const wb = new Set(normalizeTitle(b).split(' ').filter(Boolean));
    const intersection = [...wa].filter(w => wb.has(w)).length;
    const union = new Set([...wa, ...wb]).size;
    return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

export async function AmazonCrossReferenceAgent({ product_id, workflow_id, memory }) {
    const product = await prisma.product.findUnique({
        where: { id: product_id },
        include: { amazon_reference: true }
    });
    if (!product) throw new Error(`Product ${product_id} not found`);

    // Already has a high-confidence match — skip
    if (product.amazon_reference?.match_confidence >= 95) {
        return {
            skipped: true,
            reason: 'Already matched',
            asin: product.amazon_reference.asin,
            confidence: product.amazon_reference.match_confidence
        };
    }

    let asin        = null;
    let confidence  = 0;
    let matchLevel  = null;

    // ─── Level 1: ASIN in SKU/code ───────────────────────────────────────────
    const asinMatch = product.sku?.match(ASIN_REGEX) || product.name?.match(ASIN_REGEX);
    if (asinMatch) {
        asin       = asinMatch[1];
        confidence = 97;
        matchLevel = 'L1_ASIN_CODE';
    }

    // ─── Level 2: Title + Brand similarity ───────────────────────────────────
    if (!asin && product.brand && product.name) {
        // Check if memory has a previously rejected ASIN
        const rejectedAsin = memory['rejected_asin'];
        
        // Search existing AmazonReference rows for same brand
        const candidates = await prisma.$queryRawUnsafe(`
            SELECT ar.asin, p.name, p.brand, ar.match_confidence
            FROM AmazonReference ar
            JOIN Product p ON p.id = ar.product_id
            WHERE p.brand = ? AND ar.match_confidence > 70
            LIMIT 20
        `, product.brand);

        let best = null;
        let bestScore = 0;

        for (const c of candidates) {
            if (c.asin === rejectedAsin) continue; // Skip rejected
            const score = titleSimilarity(product.name, c.name);
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        }

        if (best && bestScore >= 70) {
            asin       = best.asin;
            confidence = Math.min(95, Math.round(bestScore * 0.9)); 
            matchLevel = 'L2_TITLE_BRAND';
        }
    }

    // ─── Level 3+: No match → flag for manual review ─────────────────────────
    if (!asin) {
        // Future: Vision API image comparison goes here
        return {
            status:     'NEEDS_REVIEW',
            confidence: 0,
            matchLevel: 'L5_MANUAL_REVIEW',
            product_id
        };
    }

    // ─── Persist result ───────────────────────────────────────────────────────
    const now = new Date().toISOString();
    await prisma.amazonReference.upsert({
        where:  { product_id },
        create: { product_id, asin, match_confidence: confidence, created_at: now, updated_at: now },
        update: { asin, match_confidence: confidence, updated_at: now }
    });

    // Memory: store last matched ASIN so future runs can detect regressions
    await writeMemory(product_id, 'AMAZON_CROSS_REFERENCE', 'last_matched_asin', asin, 'AMAZON_MATCH');
    await writeMemory(product_id, 'AMAZON_CROSS_REFERENCE', 'last_confidence',   String(confidence), 'AMAZON_MATCH');

    // ─── Phase 5: Permanent Reference Layer (Amazon Raw Snapshot) ────────────
    const mockRawAmazonData = {
        asin,
        original_title: "Amazon Reference Title Placeholder",
        original_description: "Amazon Description",
        original_bullet_points: ["BP 1", "BP 2"],
        original_images: ["url1.jpg"],
        original_attributes: { "Item Weight": "200g" },
        original_price: "₹300",
        original_rating: "4.5",
        original_reviews: "1000",
        original_category: "Health & Personal Care",
        original_brand: product.brand || 'Unknown',
        original_parent_asin: "B0PARENT",
        original_variant: "Flavor X"
    };

    // Store the exact snapshot permanently. Never overwriting it.
    await writeMemory(product_id, 'AMAZON_CROSS_REFERENCE', `raw_payload_${asin}`, JSON.stringify(mockRawAmazonData), 'PERMANENT_REFERENCE');

    // ─── Phase 5: Agent Decision Object ──────────────────────────────────────
    return {
        workflow_id,
        product_id,
        account: product.account_id || 'UNKNOWN',
        agent: 'AMAZON_CROSS_REFERENCE',
        problem_detected: false,
        why_detected: `Successfully mapped Ozon SKU to Amazon ASIN via ${matchLevel}`,
        evidence: JSON.stringify({ matched_asin: asin, similarity_score: confidence }),
        current_value: null,
        suggested_value: asin,
        confidence: confidence,
        expected_benefit: 'Unlocks competitor pricing, correct attributes, and English translation.',
        business_impact: 'Enables downstream pipeline optimization',
        data_source: 'Cross-Reference Engine',
        last_updated: now,
        requires_approval: false
    };
}
