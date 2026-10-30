import path from 'path';
import { open, stat } from 'fs/promises';
import { prisma } from '../../../../lib/prisma';
import { recoverStaleRuns } from '../../../../lib/pipeline/recoverRuns';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  await recoverStaleRuns();
  const runId = new URL(req.url).searchParams.get('runId');
  if (!runId) {
    return new Response('Missing runId', { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('hello', { runId });
      let offset = 0;
      let announcedWait = false;
      let sentExcerpt = false;
      const startedAt = Date.now();

      try {
        while (!closed) {
          const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
          if (!run) {
            send('error', { message: 'Run not found' });
            break;
          }

          let sawFile = false;
          if (run.run_dir) {
            const logPath = path.join(process.cwd(), run.run_dir, 'pipeline.log');
            try {
              const info = await stat(logPath);
              sawFile = true;
              if (info.size > offset) {
                const handle = await open(logPath, 'r');
                const length = info.size - offset;
                const buffer = Buffer.alloc(length);
                await handle.read(buffer, 0, length, offset);
                await handle.close();
                offset = info.size;
                for (const line of buffer.toString('utf8').split(/\r?\n/)) {
                  if (line.trim()) send('log', { line });
                }
              }
            } catch (err) {
              if (err.code !== 'ENOENT') {
                send('log', { line: `Could not read log: ${err.message}` });
              }
            }
          } else if (!announcedWait) {
            announcedWait = true;
            send('log', { line: 'Waiting for the pipeline to create its run folder...' });
          }
          if (!sawFile && !sentExcerpt && run.log_excerpt) {
            sentExcerpt = true;
            for (const line of String(run.log_excerpt).split(/\r?\n/)) {
              if (line.trim()) send('log', { line });
            }
          }

          if (run.status !== 'running') {
            send('done', {
              status: run.status,
              stage: run.stage,
              error: run.error_message,
              orders_processed: run.orders_processed,
            });
            break;
          }

          if (Date.now() - startedAt > 60 * 60 * 1000) {
            send('done', { status: 'running', error: 'Log stream closed after one hour. Refresh to reconnect.' });
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      } catch (err) {
        send('error', { message: err.message });
      } finally {
        if (!closed) controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
