/**
 * POST /api/agents/listing-errors
 * Agent #6 — Listing Error Agent
 * Scans products for Ozon validation errors, moderation issues, and generates tasks.
 */
import { prisma } from '../../../../lib/prisma';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const AGENT_NAME = 'LISTING_ERROR';

const ERROR_TYPE_MAP = {
    'brand':     { severity: 'CRITICAL', risk: 'HIGH',  safe_auto: false },
    'color':     { severity: 'HIGH',     risk: 'LOW',   safe_auto: true  },
    'variant':   { severity: 'CRITICAL', risk: 'HIGH',  safe_auto: false },
    'category':  { severity: 'HIGH',     risk: 'HIGH',  safe_auto: false },
    'upload':    { severity: 'CRITICAL', risk: 'HIGH',  safe_auto: false },
    'validation':{ severity: 'HIGH',     risk: 'LOW',   safe_auto: true  },
    'image':     { severity: 'HIGH',     risk: 'LOW',   safe_auto: false },
    'price':     { severity: 'MODERATE', risk: 'LOW',   safe_auto: false },
};

function buildTaskFromError(errorLog, product) {
    const errorTypeLower = (errorLog.error_type || '').toLowerCase();
    const matchKey = Object.keys(ERROR_TYPE_MAP).find(k => errorTypeLower.includes(k));
    const meta = ERROR_TYPE_MAP[matchKey] || { severity: 'MODERATE', risk: 'LOW', safe_auto: false };

    return {
        product_id: errorLog.product_id || (product?.id),
        account_id: errorLog.account_id || (product?.account_id),
        severity: meta.severity,
        risk_level: meta.risk,
        safe_to_auto: meta.safe_auto,
        what_is_wrong: `[${errorLog.error_type}] ${errorLog.message}`,
        why_is_wrong: errorLog.root_cause || 'Ozon validation rejected this field.',
        suggested_value: errorLog.suggested_fix || 'Review and correct the flagged field',
        expected_benefit: 'Resolves Ozon moderation error, restores listing health',
        field_name: matchKey || 'unknown',
        before_value: `Error: ${errorLog.message?.substring(0, 100)}`,
        after_value: errorLog.suggested_fix || 'Corrected value'
    };
}

export async function POST(req) {
    const runId = randomUUID();
    const startTime = new Date();

    try {
        const body = await req.json().catch(() => ({}));
        const { accountId } = body;

        await prisma.$executeRawUnsafe(`
            INSERT INTO AgentRun (id, agent_name, status, started_at)
            VALUES ('${runId}', '${AGENT_NAME}', 'RUNNING', '${startTime.toISOString()}')
        `);

        // Fetch open error logs
        const where = { status: 'OPEN' };
        if (accountId) where.account_id = accountId;

        const errorLogs = await prisma.errorLog.findMany({
            where,
            orderBy: [{ severity: 'asc' }, { created_at: 'desc' }],
            take: 500
        });

        // Also scan products with bad moderate/validation status
        const badProducts = await prisma.product.findMany({
            where: {
                status: 'ACTIVE',
                OR: [
                    { moderate_status: { not: null } },
                    { validation_status: { contains: 'error' } },
                    { validation_status: { contains: 'fail' } }
                ]
            },
            select: { id: true, sku: true, name: true, brand: true, account_id: true,
                      moderate_status: true, validation_status: true },
            take: 200
        });

        let totalTasks = 0;
        const safeStr = (s) => (s || '').replace(/'/g, "''");

        // Tasks from ErrorLog
        for (const err of errorLogs) {
            const task = buildTaskFromError(err, null);
            const taskId = randomUUID();
            await prisma.$executeRawUnsafe(`
                INSERT INTO AgentTask 
                (id, account_id, product_id, agent_name, severity, status, risk_level,
                 what_is_wrong, why_is_wrong, suggested_value, expected_benefit,
                 safe_to_auto, compliance_passed, created_at, updated_at, field_name, before_value, after_value)
                VALUES 
                ('${taskId}', ${task.account_id ? `'${task.account_id}'` : 'NULL'},
                 ${task.product_id ? `'${task.product_id}'` : 'NULL'},
                 '${AGENT_NAME}', '${task.severity}', 'PENDING', '${task.risk_level}',
                 '${safeStr(task.what_is_wrong)}', '${safeStr(task.why_is_wrong)}',
                 '${safeStr(task.suggested_value)}', '${safeStr(task.expected_benefit)}',
                 ${task.safe_to_auto ? 1 : 0}, 0, '${new Date().toISOString()}', '${new Date().toISOString()}',
                 '${task.field_name}', '${safeStr(task.before_value)}', '${safeStr(task.after_value)}')
            `);
            totalTasks++;
        }

        // Tasks from products with bad status
        for (const p of badProducts) {
            const taskId = randomUUID();
            const errType = p.validation_status?.toLowerCase().includes('error') ? 'Validation Error' : 'Moderation Issue';
            await prisma.$executeRawUnsafe(`
                INSERT OR IGNORE INTO AgentTask 
                (id, account_id, product_id, agent_name, severity, status, risk_level,
                 what_is_wrong, why_is_wrong, suggested_value, expected_benefit,
                 safe_to_auto, field_name, before_value, after_value, compliance_passed)
                VALUES 
                ('${taskId}', '${p.account_id}', '${p.id}',
                 '${AGENT_NAME}', 'HIGH', 'PENDING', 'HIGH',
                 '${errType}: Product has Ozon moderation or validation issue',
                 'Ozon returned a non-OK status for this listing during upload or sync.',
                 'Review product attributes, brand mapping, and category selection',
                 'Resolves listing block, restores sales eligibility',
                 0, 'moderate_status',
                 '${safeStr(p.moderate_status || p.validation_status)}',
                 'Corrected and resubmitted', 0)
            `);
            totalTasks++;
        }

        const endTime = new Date();
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET status = 'COMPLETE',
                products_scanned = ${errorLogs.length + badProducts.length},
                tasks_created = ${totalTasks},
                completed_at = '${endTime.toISOString()}'
            WHERE id = '${runId}'
        `);

        return NextResponse.json({
            success: true, run_id: runId,
            error_logs_scanned: errorLogs.length,
            bad_products_found: badProducts.length,
            tasks_created: totalTasks
        });

    } catch (err) {
        console.error('[LISTING_ERROR Agent Error]', err.message);
        await prisma.$executeRawUnsafe(`
            UPDATE AgentRun SET status = 'FAILED', error_message = '${err.message.replace(/'/g,"''")}', completed_at = '${new Date().toISOString()}'
            WHERE id = '${runId}'
        `).catch(() => {});
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
