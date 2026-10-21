import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import bwipjs from 'bwip-js';
import fs from 'fs';
import path from 'path';

// Wrap text into multiple lines given max chars per line
function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  words.forEach(word => {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}

export async function createThermalPDFWithDetails(originalLabelBytes, pagesData, outputPath) {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const sourcePdf = await PDFDocument.load(originalLabelBytes);
  const totalOriginalPages = sourcePdf.getPageCount();

  // 4×6 inch thermal label (in points: 1 inch = 72pt)
  const pageWidth  = 288;
  const pageHeight = 432;

  for (let i = 0; i < totalOriginalPages; i++) {
    const pageData = pagesData.find(p => p.pageIndex === i);

    const newPage = pdfDoc.addPage([pageWidth, pageHeight]);

    // ── Embed the original Ozon label ──
    const [embeddedPage] = await pdfDoc.embedPdf(originalLabelBytes, [i]);
    const emDims = embeddedPage.scale(1.0);
    const labelMargin = 2;
    const maxWidth = pageWidth - labelMargin * 2;

    // ── Pre-calculate text layout so we know how much room text needs ──
    let wrappedProducts = [];
    const FONT_SIZE   = 9;
    const LINE_H      = 11;  // px per text line
    const BLOCK_EXTRA = 20;  // SKU + Qty rows + gap per product
    const BARCODE_H   = 32;  // rough barcode block height
    const BOTTOM_PAD  = 10;

    if (pageData && pageData.products) {
      for (const product of pageData.products) {
        let titleString = (product.title || 'Unknown Title')
          .replace(/SKU|Article/gi, '')
          .trim();
        const cleanTitle = titleString.replace(/[^\x00-\x7F]/g, '').trim() || "Item";
        // At font-size 9, ~48 chars fit in the label width
        const titleLines = wrapText(`Title: ${cleanTitle}`, 48);
        wrappedProducts.push({ product, titleLines });
      }
    }

    const productCount  = wrappedProducts.length;
    const totalTitleLines = wrappedProducts.reduce((s, w) => s + w.titleLines.length, 0);
    const textBlockHeight = totalTitleLines * LINE_H + productCount * BLOCK_EXTRA + BOTTOM_PAD;
    const totalNeeded   = BARCODE_H + textBlockHeight + 20; // +20 for gap

    // Give the Ozon label as much height as possible while guaranteeing text fits
    const maxLabelHeight = Math.max(pageHeight * 0.30, pageHeight - totalNeeded - labelMargin);

    let scale = Math.min(maxWidth / emDims.width, maxLabelHeight / emDims.height);
    scale = Math.min(scale, 1.6); // never upscale beyond 1.6×

    const drawWidth  = emDims.width  * scale;
    const drawHeight = emDims.height * scale;
    const labelTopY  = pageHeight - drawHeight - labelMargin;

    newPage.drawPage(embeddedPage, {
      x: (pageWidth - drawWidth) / 2,
      y: labelTopY,
      width:  drawWidth,
      height: drawHeight,
    });

    if (!pageData) continue;

    const textMargin = 8;
    let barcodeY = labelTopY - 12;

    // ── Barcode ──
    try {
      const pngBuffer = await bwipjs.toBuffer({
        bcid:        'code128',
        text:        pageData.shipmentId,
        scale:       2,
        height:      8,
        includetext: true,
        textxalign:  'center',
      });
      const barcodeImage = await pdfDoc.embedPng(pngBuffer);
      const bcDims = barcodeImage.scale(0.45);
      barcodeY = labelTopY - bcDims.height - 8;
      newPage.drawImage(barcodeImage, {
        x:      (pageWidth - bcDims.width) / 2,
        y:      barcodeY,
        width:  bcDims.width,
        height: bcDims.height,
      });
    } catch (err) {
      console.error(`Barcode error for ${pageData.shipmentId}:`, err.message);
    }

    // ── Product details ──
    let textY = barcodeY - 14;

    for (let idx = 0; idx < wrappedProducts.length; idx++) {
      const { product, titleLines } = wrappedProducts[idx];

      // Separator between multiple products
      if (idx > 0 && textY > BOTTOM_PAD) {
        newPage.drawLine({
          start: { x: textMargin, y: textY + 4 },
          end:   { x: pageWidth - textMargin, y: textY + 4 },
          thickness: 0.4,
          color: rgb(0.7, 0.7, 0.7),
        });
        textY -= 6;
      }

      // Title lines
      for (const line of titleLines) {
        if (textY < BOTTOM_PAD) break;
        newPage.drawText(line, {
          x:    textMargin,
          y:    textY,
          size: FONT_SIZE,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        textY -= LINE_H;
      }

      // SKU
      if (textY >= BOTTOM_PAD) {
        newPage.drawText(`SKU: ${product.sku || 'N/A'}`, {
          x:    textMargin,
          y:    textY,
          size: FONT_SIZE,
          font: font,
        });
        textY -= LINE_H;
      }

      // Qty
      if (textY >= BOTTOM_PAD) {
        newPage.drawText(`Qty: ${product.qty || '1'}`, {
          x:    textMargin,
          y:    textY,
          size: FONT_SIZE + 1,
          font: boldFont,
        });
        textY -= LINE_H + 4;
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}
