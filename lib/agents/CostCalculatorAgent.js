/**
 * CostCalculatorAgent.js
 * 
 * Agent #6 — Calculates landed cost, margin and profit.
 * 
 * Formula:
 *   Landed Cost = Amazon Price (INR→RUB) + Shipping + Customs + Ozon Commission
 *   Margin      = (Ozon Price - Landed Cost) / Ozon Price × 100
 *   Profit      = Ozon Price - Landed Cost
 * 
 * If Amazon price is unavailable → WAITING_FOR_LIVE_DATA (never estimates)
 */

import { PrismaClient } from '@prisma/client';
import { writeMemory }  from '../engine/WorkflowEngine.js';

const prisma = new PrismaClient();

// Latest approximate exchange rate (will be overridden by live data when available)
const INR_TO_RUB_APPROX = 1.08; // ₹1 ≈ ₽1.08 (update via config when live FX API connected)

// Ozon commission rates by category (approximate)
const OZON_COMMISSION = {
    'Красота':              0.10,
    'Уход':                 0.10,
    'Косметика':            0.10,
    'Здоровье':             0.08,
    'Бытовая химия':        0.07,
    'DEFAULT':              0.12,
};

function getCommission(category = '') {
    for (const [cat, rate] of Object.entries(OZON_COMMISSION)) {
        if (category.toLowerCase().includes(cat.toLowerCase())) return rate;
    }
    return OZON_COMMISSION['DEFAULT'];
}

export async function CostCalculatorAgent({ product_id, workflow_id, memory }) {
    const product         = await prisma.product.findUnique({ where: { id: product_id } });
    if (!product) throw new Error(`Product ${product_id} not found`);
    const amazonReference = await prisma.amazonReference.findUnique({ where: { product_id } }).catch(() => null);

    const now = new Date().toISOString();

    // No Amazon price → cannot calculate
    if (!amazonReference?.selling_price) {
        await prisma.$executeRawUnsafe(`
            UPDATE ProductWorkflow
            SET cost_calc_status='WAITING_FOR_LIVE_DATA', cost_calc_completed_at='${now}'
            WHERE product_id='${product_id}'
        `);
        return { status: 'WAITING_FOR_LIVE_DATA', reason: 'Amazon price unavailable — cannot calculate landed cost' };
    }

    // Load AI settings for minimum margin
    const settings = await prisma.aISettings.findUnique({ where: { id: 'GLOBAL' } }).catch(() => null);
    const minMargin = settings?.min_margin_pct || 15;

    const amazonInr   = amazonReference.selling_price;
    const amazonRub   = amazonInr * INR_TO_RUB_APPROX;
    const shippingRub = 150;   // Approximate INR→RUB shipping per unit
    const customsPct  = 0.05;  // 5% customs duty
    const commission  = getCommission(product.category_name);

    const landedCost    = amazonRub + shippingRub + (amazonRub * customsPct);
    const currentPrice  = product.price;
    const ozonFee       = currentPrice * commission;
    const profit        = currentPrice - landedCost - ozonFee;
    const margin        = currentPrice > 0 ? Math.round((profit / currentPrice) * 100) : 0;

    // Suggested price: price at which minimum margin is achieved
    const suggestedPrice = Math.round(landedCost / (1 - commission - (minMargin / 100)));
    const roi            = landedCost > 0 ? Math.round((profit / landedCost) * 100) : 0;

    await prisma.$executeRawUnsafe(`
        UPDATE ProductWorkflow
        SET cost_calc_status='COMPLETE',
            cost_calc_completed_at='${now}',
            landed_cost=${landedCost.toFixed(2)},
            suggested_price=${suggestedPrice},
            expected_margin=${margin},
            expected_profit=${profit.toFixed(2)},
            roi=${roi}
        WHERE product_id='${product_id}'
    `);

    // Memory: track margin history
    const prevMargin = memory['last_margin'];
    if (prevMargin) {
        await writeMemory(product_id, 'COST_CALCULATOR', 'prev_margin', prevMargin, 'HISTORICAL_PRICE');
    }
    await writeMemory(product_id, 'COST_CALCULATOR', 'last_margin',  String(margin),        'HISTORICAL_PRICE');
    await writeMemory(product_id, 'COST_CALCULATOR', 'last_profit',  String(profit.toFixed(2)), 'HISTORICAL_PRICE');

    return {
        amazon_inr:      amazonInr,
        amazon_rub:      Math.round(amazonRub),
        landed_cost:     Math.round(landedCost),
        current_price:   currentPrice,
        suggested_price: suggestedPrice,
        margin,
        profit:          Math.round(profit),
        roi,
        below_min_margin: margin < minMargin,
        confidence:      90,
    };
}
