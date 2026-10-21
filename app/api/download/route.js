import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const filePathParam = searchParams.get('file');

    if (!filePathParam || !filePathParam.startsWith('runs/')) {
      return new NextResponse('Invalid file path', { status: 400 });
    }

    // Securely resolve the absolute path and prevent directory traversal
    const safePath = path.normalize(filePathParam).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.join(process.cwd(), safePath);

    // Verify file exists
    await stat(absolutePath);

    const fileBuffer = await readFile(absolutePath);

    // Determine content type based on extension
    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    if (ext === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.json') contentType = 'application/json';
    if (ext === '.log') contentType = 'text/plain';

    const filename = path.basename(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"` // Forces download behavior
      }
    });

  } catch (err) {
    if (err.code === 'ENOENT') {
      return new NextResponse('File not found', { status: 404 });
    }
    return new NextResponse('Server Error fetching file', { status: 500 });
  }
}
