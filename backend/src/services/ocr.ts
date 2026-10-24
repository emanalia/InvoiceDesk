import fs from 'fs';
import path from 'path';

/**
 * OCR extraction service.
 * Uses pdf-parse for PDF files and Tesseract.js for images.
 */
export async function extractText(
  filePath: string
): Promise<{ text: string; pages: number }> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractFromPdf(filePath);
  } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp'].includes(ext)) {
    return extractFromImage(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function extractFromPdf(
  filePath: string
): Promise<{ text: string; pages: number }> {
  // pdf-parse is a CommonJS module
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);

  return {
    text: data.text || '',
    pages: data.numpages || 1,
  };
}

async function extractFromImage(
  filePath: string
): Promise<{ text: string; pages: number }> {
  const Tesseract = require('tesseract.js');
  const {
    data: { text },
  } = await Tesseract.recognize(filePath, 'eng', {
    logger: () => {}, // suppress logging
  });

  return {
    text: text || '',
    pages: 1,
  };
}
