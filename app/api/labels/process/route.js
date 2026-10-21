import { NextResponse } from 'next/server';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { generateThermalLabels } from '../../../../lib/labels/generateThermalLabels';
import { applyTranslationProvider } from '../../../../lib/settings/appSettings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OUTPUT_DIR = path.join(process.cwd(), 'labels-output');
const TMP_DIR = path.join(process.cwd(), 'tmp', 'labels');

function isPdf(file) {
  if (!file || typeof file === 'string') return false;
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

export async function POST(req) {
  let labelPath = '';
  let productPath = '';

  try {
    let form;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Upload the two PDF files.' }, { status: 400 });
    }
    const shippingLabel = form.get('shippingLabel');
    const productList = form.get('productList');

    if (!isPdf(shippingLabel)) {
      return NextResponse.json({ error: 'Upload a shipping label PDF.' }, { status: 400 });
    }
    if (!isPdf(productList)) {
      return NextResponse.json({ error: 'Upload a product list PDF.' }, { status: 400 });
    }

    await mkdir(TMP_DIR, { recursive: true });
    await mkdir(OUTPUT_DIR, { recursive: true });

    const stamp = Date.now();
    labelPath = path.join(TMP_DIR, `label_${stamp}.pdf`);
    productPath = path.join(TMP_DIR, `product_${stamp}.pdf`);
    const filename = `thermal_labels_${stamp}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    await writeFile(labelPath, Buffer.from(await shippingLabel.arrayBuffer()));
    await writeFile(productPath, Buffer.from(await productList.arrayBuffer()));

    const restoreTranslation = await applyTranslationProvider();
    let result;
    try {
      result = await generateThermalLabels({
        labelPdfPath: labelPath,
        productPdfPath: productPath,
        outputPath,
      });
    } finally {
      restoreTranslation();
    }

    await writeFile(path.join(OUTPUT_DIR, 'latest.json'), JSON.stringify({
      filename,
      labelCount: result.labelCount,
      createdAt: new Date().toISOString(),
    }));

    return NextResponse.json({
      labelCount: result.labelCount,
      filename,
      downloadUrl: `/api/labels/download?f=${encodeURIComponent(filename)}`,
    });
  } catch (error) {
    console.error('[labels/process]', error);
    return NextResponse.json({ error: error.message || 'Label processing failed.' }, { status: 500 });
  } finally {
    if (labelPath) await unlink(labelPath).catch(() => {});
    if (productPath) await unlink(productPath).catch(() => {});
  }
}
