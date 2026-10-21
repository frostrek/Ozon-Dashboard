/**
 * GET  /api/settings → returns current AISettings
 * PATCH /api/settings → updates AISettings fields
 * POST  /api/settings → seeds default settings if not present
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const DEFAULTS = {
    min_margin_pct:             15.0,
    min_match_confidence:       90,
    min_seo_score:              80,
    min_content_rating:         85,
    price_protection_pct:       5.0,
    auto_retry_count:           3,
    queue_concurrency:          50,
    groq_model:                 'llama3-70b-8192',
    google_vision_model:        'gemini-1.5-pro-latest',
    amazon_scan_freq_hours:     168,
    competitor_scan_freq_hours: 24,
};

export async function GET() {
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT * FROM AISettings WHERE id='GLOBAL' LIMIT 1`).catch(() => []);
        if (rows.length > 0) {
            return NextResponse.json(rows[0]);
        } else {
            // Seed defaults directly via raw SQL
            const keys = Object.keys(DEFAULTS);
            const vals = Object.values(DEFAULTS);
            const cols = ['id', ...keys, 'updated_at'].join(', ');
            const placeholders = ['"GLOBAL"', ...vals.map(v => typeof v === 'string' ? `"${v}"` : v), `"${new Date().toISOString()}"`].join(', ');
            await prisma.$executeRawUnsafe(`INSERT INTO AISettings (${cols}) VALUES (${placeholders})`).catch(() => null);
            return NextResponse.json({ id: 'GLOBAL', ...DEFAULTS });
        }
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req) {
    try {
        const body = await req.json();
        const allowed = Object.keys(DEFAULTS);
        const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
        
        if (updates.length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const setClause = updates.map(([k, v]) => `${k} = ${typeof v === 'string' ? `"${v}"` : v}`).join(', ');
        const now = new Date().toISOString();
        
        // Basic upsert simulation with raw SQL (update then insert if needed)
        const count = await prisma.$executeRawUnsafe(`UPDATE AISettings SET ${setClause}, updated_at="${now}" WHERE id='GLOBAL'`);
        if (count === 0) {
            // Insert if it didn't exist
            const allVals = { ...DEFAULTS, ...Object.fromEntries(updates) };
            const cols = ['id', ...Object.keys(allVals), 'updated_at'].join(', ');
            const placeholders = ['"GLOBAL"', ...Object.values(allVals).map(v => typeof v === 'string' ? `"${v}"` : v), `"${now}"`].join(', ');
            await prisma.$executeRawUnsafe(`INSERT INTO AISettings (${cols}) VALUES (${placeholders})`);
        }
        
        const latest = await prisma.$queryRawUnsafe(`SELECT * FROM AISettings WHERE id='GLOBAL' LIMIT 1`);
        return NextResponse.json(latest[0] || {});
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
