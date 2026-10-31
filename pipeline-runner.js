import { PrismaClient } from '@prisma/client';
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "path";
import { createLogger } from "./logger.js";
import { fetchOrders } from "./01-fetch-orders.js";
import { translateOrders } from "./02-translate.js";
import { generatePdfs } from "./03-generate.js";
import { exportToExcel } from "./04-excel.js";
import { notifySuccess, notifyFailure, notifyNoOrders } from "./05-notify.js";
import { getAppSetting } from "./lib/settings/appSettings.js";

const prisma = new PrismaClient();
const accountId = process.argv[2];
const existingRunId = process.argv[3];

const ORDER_PICTURE_STATUSES = [
    { status: 'awaiting_packaging', label: 'Ready to pack', detail: 'This run creates labels only for these orders.' },
    { status: 'acceptance_in_progress', label: 'Being accepted', detail: 'Ozon is still accepting the shipment.' },
    { status: 'awaiting_deliver', label: 'Waiting for pickup', detail: 'Already packed. This run leaves them alone.' },
    { status: 'delivering', label: 'On the way', detail: 'Already with the courier.' },
    { status: 'delivered', label: 'Delivered', detail: 'Completed in this 30-day window.' },
    { status: 'cancelled', label: 'Cancelled', detail: 'Cancelled in this 30-day window.' },
];

function orderWindow() {
    const from = String(process.env.PIPELINE_DATE_FROM || '').trim();
    const to = String(process.env.PIPELINE_DATE_TO || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        const since = new Date(`${from}T00:00:00.000Z`);
        const end = new Date(`${to}T23:59:59.000Z`);
        if (!Number.isNaN(since.getTime()) && !Number.isNaN(end.getTime()) && since <= end) {
            return { since, to: end, label: `${from} to ${to}` };
        }
    }
    const end = new Date();
    const since = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { since, to: end, label: 'the last 30 days' };
}

function describeOrderPicture(accountName, rows, windowLabel = 'the last 30 days') {
    const ready = rows.find((row) => row.status === 'awaiting_packaging');
    const others = rows.filter((row) => row.status !== 'awaiting_packaging' && typeof row.count === 'number' && row.count > 0);
    const also = others.length
        ? `Also in that window: ${others.map((row) => `${row.count} ${row.label.toLowerCase()}`).join(', ')}.`
        : 'The other statuses in that window are empty too.';

    if (!ready || ready.count === 0) {
        return `${accountName} has nothing ready to pack in ${windowLabel}. This run only creates labels for orders that are ready to pack, so it will finish without a PDF or Excel file. ${also}`;
    }

    const noun = ready.count === 1 ? 'order' : 'orders';
    return `${accountName} has ${ready.count} ${noun} ready to pack. This run will process those. ${also}`;
}

async function buildOrderPicture(account, readyCount, statusCounts = {}) {
    const range = orderWindow();
    const rows = [];

    for (const item of ORDER_PICTURE_STATUSES) {
        const count = item.status === 'awaiting_packaging'
            ? readyCount
            : (statusCounts[item.status] || 0);
        rows.push({ ...item, count });
    }

    const summary = describeOrderPicture(account.name, rows, range.label);

    return {
        account: account.name,
        days: 30,
        rows,
        summary,
    };
}

// Map Ozon API raw status strings → our normalised DB status
const OZON_STATUS_MAP = {
    'awaiting_packaging':   'AWAITING_PACKAGING',
    'awaiting_deliver':     'AWAITING_DELIVERY',
    'delivering':           'IN_TRANSIT',
    'delivered':            'DELIVERED',
    'cancelled':            'CANCELLED',
    'not_accepted':         'CANCELLED',
    'arbitration':          'ARBITRATION',
    'cancelled_from_split': 'CANCELLED',
};

console.log(`[pipeline-runner] Starting with accountId: ${accountId}`);

// ------------------------------------------------------------
// Helper: upsert status + record history if it changed
// ------------------------------------------------------------
async function updateOrderStatus(order, newOzonStatus) {
    const newStatus = OZON_STATUS_MAP[newOzonStatus] || newOzonStatus.toUpperCase();
    if (order.status === newStatus) return false;

    console.log(`[status-sync] ${order.posting_number}: ${order.status} → ${newStatus}`);

    await prisma.order.update({
        where: { id: order.id },
        data: { status: newStatus },
    });

    await prisma.orderStatusHistory.create({
        data: {
            order_id:   order.id,
            status:     newStatus,
            changed_at: new Date(),
        },
    });
    return true;
}

// ------------------------------------------------------------
// Main pipeline run
// ------------------------------------------------------------
let runRecord = null;
let logFilePath = null;
const stageLines = [];
const LOG_EXCERPT_MAX = 200 * 1024;

async function note(stage, message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    stageLines.push(line);
    if (logFilePath) {
        await appendFile(logFilePath, line + '\n', 'utf8');
    }
    if (!runRecord) return;
    await prisma.pipelineRun.update({
        where: { id: runRecord.id },
        data: {
            stage,
            log_excerpt: stageLines.join('\n').slice(-LOG_EXCERPT_MAX),
        },
    });
}

async function finish(code) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await prisma.$disconnect().catch(() => {});
    process.exit(code);
}

async function notifyIfEnabled(kind, args, accountName) {
    try {
        const settings = await getAppSetting();
        if (!settings.notify_on_dashboard_runs) return;
        if (!settings.telegram_bot_token || !settings.telegram_chat_ids) {
            console.log('[pipeline-runner] Telegram is enabled, but the token or chat IDs are missing.');
            return;
        }
        process.env.TELEGRAM_BOT_TOKEN = settings.telegram_bot_token;
        process.env.TELEGRAM_ALLOWED_CHAT_IDS = settings.telegram_chat_ids;
        process.env.ACCOUNT_LABEL = accountName || 'Dashboard';
        if (kind === 'success') await notifySuccess(args);
        else if (kind === 'none') await notifyNoOrders(args);
        else await notifyFailure(args);
        console.log('[pipeline-runner] Telegram notification finished.');
    } catch (err) {
        console.error(`[pipeline-runner] Telegram notification failed: ${err.message}`);
    }
}

async function run() {
    if (!accountId) {
        console.error("[pipeline-runner] ERROR: Missing accountId. Usage: bun pipeline-runner.js <accountId> [runId]");
        process.exit(1);
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
        console.error(`[pipeline-runner] ERROR: Account not found: ${accountId}`);
        if (existingRunId) {
            await prisma.pipelineRun.update({
                where: { id: existingRunId },
                data: { status: 'failed', stage: 'failed', end_time: new Date(), error_message: 'Account not found' },
            }).catch(() => {});
        }
        await finish(1);
    }
    if (!account.client_id || !account.api_key) {
        const message = 'Account is missing an Ozon client id or API key';
        console.error(`[pipeline-runner] ERROR: ${message}`);
        if (existingRunId) {
            await prisma.pipelineRun.update({
                where: { id: existingRunId },
                data: { status: 'failed', stage: 'failed', end_time: new Date(), error_message: message },
            }).catch(() => {});
        }
        await finish(1);
    }
    console.log(`[pipeline-runner] Account loaded: ${account.name}`);

    process.env.OZON_CLIENT_ID = account.client_id;
    process.env.OZON_API_KEY   = account.api_key;

    if (existingRunId) {
        runRecord = await prisma.pipelineRun.findUnique({ where: { id: existingRunId } });
        if (!runRecord) {
            console.error(`[pipeline-runner] ERROR: PipelineRun not found: ${existingRunId}`);
            await finish(1);
        }
    } else {
        runRecord = await prisma.pipelineRun.create({
            data: { account_id: account.id, status: 'running', stage: 'starting', start_time: new Date() }
        });
    }

    const now          = new Date();
    const timestamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 16).replace('T', '_');
    const runDirName   = `${timestamp}_run_${account.name.replace(/\s+/g, '_')}`;
    const runDir       = path.join(process.cwd(), 'runs', runDirName);
    await mkdir(runDir, { recursive: true });
    logFilePath = path.join(runDir, 'pipeline.log');

    await prisma.pipelineRun.update({
        where: { id: runRecord.id },
        data: { run_dir: `runs/${runDirName}`, status: 'running' },
    });

    const logger    = createLogger(runDir);
    globalThis.ozonNote = (message) => note('fetch', message);
    const startTime = performance.now();

    try {
        await note('fetch', `Fetching orders that are ready to pack for ${account.name}...`);
        console.log(`[pipeline-runner] STAGE 1: Fetching AWAITING_PACKAGING orders...`);
        const { count, statusCounts, statusByNumber } = await fetchOrders(runDir, logger);
        console.log(`[pipeline-runner] STAGE 1 complete: ${count} orders fetched`);

        await note('snapshot', `Counting the other statuses from the orders already read for ${account.name}...`);
        try {
            const picture = await buildOrderPicture(account, count, statusCounts || {});
            await note('snapshot', `ORDER_PICTURE ${JSON.stringify(picture)}`);
            await note('snapshot', `${orderWindow().label} for ${account.name}:`);
            for (const row of picture.rows) {
                await note('snapshot', `${row.label}: ${row.count}`);
            }
            await note('snapshot', picture.summary);
        } catch (err) {
            await note('snapshot', `Could not build the full order picture: ${err.message}`);
        }

        if (count === 0) {
            await note('done', 'Nothing is ready to pack, so no label files were created. Pipeline finished.');
            await prisma.pipelineRun.update({
                where: { id: runRecord.id },
                data: { status: 'success', stage: 'done', end_time: new Date(), orders_processed: 0, duration: '0s' }
            });
            await notifyIfEnabled('none', { logger }, account.name);
            await finish(0);
        }

        await note('sync', 'Updating open orders from the list already read...');

        console.log(`[pipeline-runner] STAGE 0: Syncing status of existing open orders...`);
        const openOrders = await prisma.order.findMany({
            where: {
                account_id: account.id,
                status: { in: ['AWAITING_PACKAGING', 'AWAITING_DELIVERY', 'IN_TRANSIT'] }
            }
        });
        console.log(`[pipeline-runner] STAGE 0: ${openOrders.length} open orders to check`);
        if (openOrders.length) {
            const known = statusByNumber || {};
            let changed = 0;
            let seen = 0;
            let outside = 0;
            for (const order of openOrders) {
                const ozonStatus = known[order.posting_number];
                if (!ozonStatus) {
                    outside += 1;
                    continue;
                }
                seen += 1;
                if (await updateOrderStatus(order, ozonStatus)) changed += 1;
            }
            const outsideNote = outside
                ? ` ${outside} open orders are outside this date range and were left as they are.`
                : '';
            await note('sync', `Status sync finished. ${seen} of ${openOrders.length} open orders were in this date range. ${changed} changed.${outsideNote}`);
        }
        console.log(`[pipeline-runner] STAGE 0 complete: status sync done`);
        await note('products', 'Not scanning the full product catalog. This run only processes the orders above. Use Products → Sync from Ozon to refresh the catalog.');
        console.log(`[pipeline-runner] STAGE 0.5 skipped: full product catalog sync is not part of packing orders`);

        // ── STAGE 2 : Upsert fetched orders into DB ────────────────────────
        await note('save', 'Saving orders...');
        console.log(`[pipeline-runner] STAGE 2: Saving ${count} orders to database...`);
        const rawContent = await readFile(path.join(runDir, '01_data_raw.json'), 'utf8');
        const orders     = JSON.parse(rawContent);

        for (const order of orders) {
            const existing = await prisma.order.findUnique({
                where: { account_id_posting_number: { account_id: account.id, posting_number: order.posting_number } }
            });
            const newStatus = OZON_STATUS_MAP[order.status] || 'AWAITING_PACKAGING';

            const pr = order.products?.[0] || {};
            const fp = order.financial_data?.products?.find(x => x.product_id == pr.offer_id || x.product_id == pr.product_id) || order.financial_data?.products?.[0] || {};
            const price = parseFloat(fp.price || pr.price || 0);
            const currency = fp.currency_code || 'USD';

            if (existing) {
                // Record history if status changed
                if (existing.status !== newStatus) {
                    await prisma.order.update({
                        where: { id: existing.id },
                        data: { status: newStatus, raw_json: JSON.stringify(order), customer_name: order.customer?.name, original_price: price, original_currency: currency }
                    });
                    await prisma.orderStatusHistory.create({
                        data: { order_id: existing.id, status: newStatus }
                    });
                } else {
                    await prisma.order.update({
                        where: { id: existing.id },
                        data: { raw_json: JSON.stringify(order), customer_name: order.customer?.name, original_price: price, original_currency: currency }
                    });
                }
            } else {
                // Brand new order
                const created = await prisma.order.create({
                    data: {
                        account_id:     account.id,
                        posting_number: order.posting_number,
                        status:         newStatus,
                        raw_json:       JSON.stringify(order),
                        customer_name:  order.customer?.name,
                        original_price: price,
                        original_currency: currency
                    }
                });
                // Seed initial history entry
                await prisma.orderStatusHistory.create({
                    data: { order_id: created.id, status: newStatus }
                });
            }
        }
        console.log(`[pipeline-runner] STAGE 2 complete: ${count} orders upserted`);

        // ── STAGE 3 : Translate ───────────────────────────────────────────
        await note('translate', 'Translating...');
        console.log(`[pipeline-runner] STAGE 3: Translating...`);
        await translateOrders(runDir, logger);
        console.log(`[pipeline-runner] STAGE 3 complete`);

        // ── STAGE 3.5 : Save Translated JSON to DB ───────────────────────
        console.log(`[pipeline-runner] STAGE 3.5: Saving translated titles...`);
        const translatedContent = await readFile(path.join(runDir, '02_data_translated.json'), 'utf8');
        const translatedOrders  = JSON.parse(translatedContent);
        
        for (const trans of translatedOrders) {
            // Find the original order from DB to keep the Russian name as a backup
            const orig = await prisma.order.findUnique({
                 where: { account_id_posting_number: { account_id: account.id, posting_number: trans.posting_number } }
            });
            if (orig) {
                const origParsed = JSON.parse(orig.raw_json);
                // Inject translated names while preserving original in a new field
                trans.products.forEach((p, i) => {
                     p._russian_name = origParsed.products?.[i]?.name || '';
                });
                await prisma.order.update({
                     where: { id: orig.id },
                     data: { raw_json: JSON.stringify(trans) }
                });
            }
        }
        console.log(`[pipeline-runner] STAGE 3.5 complete`);

        // ── STAGE 4 : Generate PDFs ───────────────────────────────────────
        await note('pdf', 'Generating PDF...');
        console.log(`[pipeline-runner] STAGE 4: Generating PDFs...`);
        await generatePdfs(runDir, logger);
        console.log(`[pipeline-runner] STAGE 4 complete`);

        // ── STAGE 5 : Export Excel ────────────────────────────────────────
        await note('excel', 'Exporting Excel...');
        console.log(`[pipeline-runner] STAGE 5: Exporting Excel...`);
        await exportToExcel(runDir, logger);
        console.log(`[pipeline-runner] STAGE 5 complete`);

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

        await prisma.report.create({
            data: {
                account_id:       account.id,
                pdf_url:          `/runs/${runDirName}/final.pdf`,
                excel_url:        `/runs/${runDirName}/03_report.xlsx`,
                orders_processed: count,
                status:           'success'
            }
        });

        await note('done', `Pipeline finished. ${count} orders in ${elapsed}s.`);
        await prisma.pipelineRun.update({
            where: { id: runRecord.id },
            data: { status: 'success', stage: 'done', end_time: new Date(), orders_processed: count, duration: `${elapsed}s` }
        });

        console.log(`[pipeline-runner] ✅ Pipeline COMPLETED for ${account.name} in ${elapsed}s — ${count} AWAITING_PACKAGING orders`);
        await notifyIfEnabled('success', { runDir, count, elapsed, logger }, account.name);
        await finish(0);

    } catch (e) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.error(`[pipeline-runner] ❌ PIPELINE FAILED: ${e.message}`);
        console.error(e.stack);
        if (logFilePath) {
            await appendFile(logFilePath, `[${new Date().toISOString()}] Pipeline failed: ${e.message}\n`, 'utf8').catch(() => {});
        }
        if (runRecord) {
            await prisma.pipelineRun.update({
                where: { id: runRecord.id },
                data: {
                    status: 'failed',
                    stage: 'failed',
                    end_time: new Date(),
                    error_message: e.message,
                    duration: `${elapsed}s`,
                    log_excerpt: [...stageLines, e.message].join('\n').slice(-LOG_EXCERPT_MAX),
                }
            });
        }
        await notifyIfEnabled('failure', { error: e, logger }, account.name);
        await finish(1);
    }
}

run().catch(async (e) => {
    console.error(`[pipeline-runner] FATAL: ${e.message}`);
    if (runRecord) {
        await prisma.pipelineRun.update({
            where: { id: runRecord.id },
            data: { status: 'failed', stage: 'failed', end_time: new Date(), error_message: e.message },
        }).catch(() => {});
    }
    await finish(1);
});
