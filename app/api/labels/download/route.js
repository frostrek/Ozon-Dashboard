import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const OUTPUT_DIR = path.join(process.cwd(), 'labels-output');
const FILE_NAME = /^thermal_labels_\d+\.pdf$/;

export async function GET(req) {
  const filename = new URL(req.url).searchParams.get('f') || '';
  if (!FILE_NAME.test(filename) || filename !== path.basename(filename)) {
    return new NextResponse('Invalid file name', { status: 400 });
  }

  const absolutePath = path.join(OUTPUT_DIR, filename);
  try {
    await stat(absolutePath);
    const fileBuffer = await readFile(absolutePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return new NextResponse('File not found', { status: 404 });
    }
    return new NextResponse('Server error fetching file', { status: 500 });
  }
}
