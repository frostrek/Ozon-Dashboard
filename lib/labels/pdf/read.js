import fs from 'fs';
import { PDFParse } from 'pdf-parse';

export async function readPdf(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (error) {
    throw new Error(`Failed to read PDF: ${error.message}`);
  }
}

export async function readPdfPages(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    
    // getText with default params returns Result which includes pages array
    const result = await parser.getText();
    const pagesText = result.pages.map(p => p.text);
    
    await parser.destroy();
    return pagesText;
  } catch (error) {
    throw new Error(`Failed to read PDF text: ${error.message}`);
  }
}
