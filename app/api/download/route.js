import { NextResponse } from 'next/server';
import { readStoredRunFile } from '../../../lib/pipeline/runFileStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const filePathParam = searchParams.get('file');

    if (!filePathParam || !filePathParam.startsWith('runs/')) {
      return new NextResponse('Invalid file path', { status: 400 });
    }

    const stored = await readStoredRunFile(filePathParam);
    if (!stored) {
      return new NextResponse(
        'File not found. Render clears disk on each deploy. New pipeline runs keep PDF and Excel in the database.',
        { status: 404 },
      );
    }

    return new NextResponse(stored.buffer, {
      status: 200,
      headers: {
        'Content-Type': stored.contentType,
        'Content-Disposition': `attachment; filename="${stored.filename}"`,
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return new NextResponse('File not found', { status: 404 });
    }
    return new NextResponse('Server Error fetching file', { status: 500 });
  }
}
