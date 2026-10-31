import { access } from 'fs/promises';
import path from 'path';
import { listStoredFilenames } from './runFileStore';

export const OUTPUT_FILES = [
  'final.pdf',
  '03_report.xlsx',
  '01_data_raw.json',
  '02_data_translated.json',
  'pipeline.log',
];

export function toRunDir(runDirName) {
  return `runs/${runDirName}`.replace(/\\/g, '/');
}

export async function listRunFiles(runDirRel) {
  if (!runDirRel || !String(runDirRel).replace(/\\/g, '/').startsWith('runs/')) {
    return [];
  }
  const relDir = String(runDirRel).replace(/\\/g, '/').replace(/\/+$/, '');
  const files = [];
  for (const name of OUTPUT_FILES) {
    const rel = `${relDir}/${name}`;
    try {
      await access(path.join(process.cwd(), rel));
      files.push({
        name,
        url: `/api/download?file=${encodeURIComponent(rel)}`,
      });
    } catch {
      // File is not on disk yet; GridFS is checked below.
    }
  }
  if (files.length === OUTPUT_FILES.length) return files;
  const stored = await listStoredFilenames(relDir);
  const listed = new Set(files.map((file) => file.name));
  for (const name of OUTPUT_FILES) {
    if (listed.has(name)) continue;
    const rel = `${relDir}/${name}`;
    if (!stored.has(rel)) continue;
    files.push({
      name,
      url: `/api/download?file=${encodeURIComponent(rel)}`,
    });
  }
  return files;
}

export function serializeRun(run, files = []) {
  return {
    id: run.id,
    account_id: run.account_id,
    account_name: run.account?.name || null,
    status: run.status,
    stage: run.stage,
    start_time: run.start_time,
    end_time: run.end_time,
    duration: run.duration,
    orders_processed: run.orders_processed,
    error_message: run.error_message,
    run_dir: run.run_dir,
    pid: run.pid,
    cancelled: run.cancelled,
    files,
  };
}
