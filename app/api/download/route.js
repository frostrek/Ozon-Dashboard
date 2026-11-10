import { NextResponse } from 'next/server';
import { readStoredRunFile } from '../../../lib/pipeline/runFileStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const filePathParam = searchParams.get('file');
    const forceDownload = searchParams.get('download') === '1';

    if (!filePathParam || !filePathParam.startsWith('runs/')) {
      return new NextResponse('Invalid file path', { status: 400 });
    }

    let stored = await readStoredRunFile(filePathParam);
    if (!stored && filePathParam.endsWith('/final.pdf')) {
      // Auto-healing fallback: on-the-fly render from 02_data_translated.json if final.pdf was cleared or missing
      try {
        const transPath = filePathParam.replace(/final\.pdf$/, '02_data_translated.json');
        const transStored = await readStoredRunFile(transPath);
        if (transStored) {
          const orders = JSON.parse(transStored.buffer.toString('utf8'));
          const { pathToFileURL } = await import('url');
          const generateModulePath = pathToFileURL(path.join(process.cwd(), '03-generate.js')).href;
          const { renderOrdersToPdf } = await import(/* webpackIgnore: true */ generateModulePath);
          const pdfBuffer = await renderOrdersToPdf(orders);
          stored = {
            buffer: pdfBuffer,
            filename: 'final.pdf',
            contentType: 'application/pdf',
          };
        }
      } catch (regenErr) {
        console.error('[download/auto-healing-pdf]', regenErr);
      }
    }

    if (!stored) {
      return new NextResponse(
        'File not found. Render clears disk on each deploy. New pipeline runs keep PDF and Excel in the database.',
        { status: 404 },
      );
    }

    const isPdf = stored.filename.toLowerCase().endsWith('.pdf');
    let friendlyName = stored.filename;
    if (stored.filename === 'final.pdf') {
      friendlyName = 'Product_List.pdf';
    } else if (stored.filename === '03_report.xlsx') {
      friendlyName = 'Shipment_Report.xlsx';
    }

    // PDFs open inline in browser preview tab; Excel and others download as attachment
    const dispositionType = forceDownload ? 'attachment' : (isPdf ? 'inline' : 'attachment');

    return new NextResponse(stored.buffer, {
      status: 200,
      headers: {
        'Content-Type': stored.contentType,
        'Content-Disposition': `${dispositionType}; filename="${friendlyName}"`,
        'Content-Length': String(stored.buffer.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return new NextResponse('File not found', { status: 404 });
    }
    return new NextResponse('Server Error fetching file', { status: 500 });
  }
}
