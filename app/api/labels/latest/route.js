import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const FILE_NAME = /^thermal(?:-labels-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}|_labels_\d+)\.pdf$/;

export async function GET() {
  const latestPath = path.join(process.cwd(), 'labels-output', 'latest.json');
  try {
    await stat(latestPath);
    const latest = JSON.parse(await readFile(latestPath, 'utf8'));
    if (!latest?.filename || !FILE_NAME.test(latest.filename)) {
      return NextResponse.json({ latest: null });
    }
    const pdfPath = path.join(process.cwd(), 'labels-output', latest.filename);
    await stat(pdfPath);
    return NextResponse.json({
      latest: {
        filename: latest.filename,
        labelCount: latest.labelCount,
        createdAt: latest.createdAt,
        downloadUrl: `/api/labels/download?f=${encodeURIComponent(latest.filename)}`,
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ latest: null });
    }
    return NextResponse.json({ error: 'Could not read the last label file.' }, { status: 500 });
  }
}
