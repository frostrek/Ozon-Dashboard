/**
 * POST /api/agents/content-rating
 * Agent #5 — Content Rating Agent
 * Daily scan: find listings with low Content Rating, diagnose WHY, generate tasks.
 */
import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const AGENT_NAME = 'CONTENT_RATING';

function diagnoseContentRating(p) {
    const tasks = [];
    const cr = p.content_rating || 0;
    if (cr >= 80) return tasks; // Already healthy — skip

    let attrs = {};
    let images = [];
    try { attrs = JSON.parse(p.attributes_json || '{}'); } catch(e) {}
    try { images = JSON.parse(p.images_json || '[]'); } catch(e) {}

    const imgCount = Array.isArray(images) ? images.length : 0;
    const desc = attrs?.description || attrs?.annotation || '';
    const attrKeys = Object.keys(attrs).filter(k => !['description','annotation','keywords'].includes(k));

    // Calculate what's dragging the rating down
    const diagnoses = [];
    let estimatedGain = 0;

    if (imgCount === 0) { diagnoses.push('No images uploaded'); estimatedGain += 20; }
    else if (imgCount < 3) { diagnoses.push(`Only ${imgCount} image — need 6+`); estimatedGain += 12; }
    else if (imgCount < 6) { diagnoses.push(`${imgCount} images — add ${6 - imgCount} more`); estimatedGain += 6; }

    if (!desc || desc.length < 50) { diagnoses.push('Description missing or too short'); estimatedGain += 15; }
    else if (desc.length < 200) { diagnoses.push('Description too brief (< 200 chars)'); estimatedGain += 8; }

    if (attrKeys.length < 4) { diagnoses.push(`Only ${attrKeys.length} attributes filled`); estimatedGain += 10; }

    if (!attrs.Цвет && !attrs.color) { diagnoses.push('Missing Color attribute'); estimatedGain += 5; }
    if (!attrs.Вес && !attrs['Вес нетто'] && !attrs.weight) { diagnoses.push('Missing Weight attribute'); estimatedGain += 5; }

    const hasRussian = /[а-яА-Я]/.test(desc);
    if (!hasRussian) { diagnoses.push('Description not in Russian'); estimatedGain += 10; }

    if (diagnoses.length === 0) return tasks;

    const projectedRating = Math.min(95, cr + estimatedGain);
    const severity = cr < 30 ? 'CRITICAL' : cr < 60 ? 'HIGH' : 'MODERATE';

    tasks.push({
        severity,
        what_is_wrong: `Content Rating is ${cr}% — below the 80% Ozon threshold`,
        why_is_wrong: `Root causes identified: ${diagnoses.join('; ')}`,
        suggested_value: diagnoses.join(' | '),
        expected_benefit: `+${estimatedGain}% Content Rating (projected: ${projectedRating}%)`,
        field_name: 'content_rating',
        before_value: `${cr}%`,
        after_value: `~${projectedRating}%`,
        safe_to_auto: false,
        risk_level: 'LOW'
    });

    return tasks;
}

export async function POST(req) {
    const runId = randomUUID();
    const startTime = new Date();

    try {
        const body = await req.json().catch(() => ({}));
        const { accountId, threshold = 80 } = body;

        await prisma.$executeRawUnsafe(`
            INSERT INTO AgentRun (id, agent_name, status, started_at)
            VALUES ('${runId}', '${AGENT_NAME}', 'RUNNING', '${startTime.toISOString()}')
        `);

        const where = { status: 'ACTIVE', content_rating: { lt: threshold } };
        if (accountId) where.account_id = accountId;

        const products = await prisma.product.findMany({
            where,
            select: {
                id: true, sku: true, name: true, brand: true,
                category_name: true, images_json: true, attributes_json: true,
                content_rating: true, account_id: true
            },
            orderBy: { content_rating: 'asc' },
            take: 1000
        });

        let totalTasks = 0;

        for (const p of products) {
            const tasks = diagnoseContentRating(p);
            for (const task of tasks) {
                const taskId = randomUUID();
                const safeStr = (s) => (s || '').replace(/'/g, "''");
                await prisma.$executeRawUnsafe(`
                    INSERT OR IGNORE INTO AgentTask 
                    (id, account_id, product_id, agent_name, severity, status, risk_level,
                     what_is_wrong, why_is_wrong, suggested_value, expected_benefit,
                     safe_to_auto, field_name, before_value, after_value, compliance_passed, created_at, updated_at)
                    VALUES 
                    ('${taskId}', ${p.account_id ? `'${p.account_id}'` : 'NULL'}, '${p.id}',
                     '${AGENT_NAME}', '${task.severity}', 'PENDING', '${task.risk_level}',
                     '${safeStr(task.what_is_wrong)}', '${safeStr(task.why_is_wrong)}',
                     '${safeStr(task.suggested_value)}', '${safeStr(task.expected_benefit)}',
                     ${task.safe_to_auto ? 1 : 0}, '${task.field_name}',
                     '${safeStr(task.before_value)}', '${safeStr(task.after_value)}', 0, '${new Date().toISOString()}', '${new Date().toISOString()}')
                `);
                totalTasks++;
            }
        }

        const endTime = new Date();
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET status = 'COMPLETE',
                products_scanned = ${products.length},
                tasks_created = ${totalTasks},
                completed_at = '${endTime.toISOString()}'
            WHERE id = '${runId}'
        `);

        return NextResponse.json({
            success: true, run_id: runId,
            products_scanned: products.length,
            tasks_created: totalTasks,
            threshold_used: threshold
        });

    } catch (err) {
        console.error('[CONTENT_RATING Agent Error]', err.message);
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET status = 'FAILED', error_message = '${err.message.replace(/'/g,"''")}'
            WHERE id = '${runId}'
        `).catch(() => {});
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
