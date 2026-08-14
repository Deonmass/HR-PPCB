import 'server-only';

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeDocxFromTemplate } from './docx-template';
import { PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import {
  buildLeaveAttestationParagraphs,
  fillLeaveAttestationXml,
  formatLeaveDocumentDate,
  loadLeaveAttestationHeaderImage,
  LEAVE_ATTESTATION_TEMPLATE_PATH,
} from './leave-attestation-template';
import type { LeaveAttestationFormData } from './leave-attestation-types';
import { convertDocxToPdf } from './travel-pdf';
import { isWindows } from './windows-shell';

async function buildLeaveAttestationPdfWithPdfLib(
  data: LeaveAttestationFormData,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const marginX = 64;
  const maxWidth = 595.28 - marginX * 2;
  let y = 800;

  const headerImage = await loadLeaveAttestationHeaderImage();
  const addressSize = 8;
  const addressLineH = 10;
  let logoBottomY = y;

  if (headerImage) {
    const embedded =
      headerImage.mime === 'image/png'
        ? await pdf.embedPng(headerImage.bytes)
        : await pdf.embedJpg(headerImage.bytes);
    const width = Math.min(210, maxWidth * 0.42);
    const height = (embedded.height / embedded.width) * width;
    const logoY = y - height;
    page.drawImage(embedded, {
      x: marginX,
      y: logoY,
      width,
      height,
    });
    logoBottomY = logoY;
  }

  let addressY = y - 2;
  for (const line of PPC_LETTERHEAD_ADDRESS_LINES) {
    const width = font.widthOfTextAtSize(line, addressSize);
    page.drawText(line, {
      x: 595.28 - marginX - width,
      y: addressY - addressSize,
      size: addressSize,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    addressY -= addressLineH;
  }

  y = Math.min(logoBottomY, addressY) - 28;

  const paragraphs = buildLeaveAttestationParagraphs(data);

  const wrap = (text: string, size: number, useBold: boolean) => {
    const active = useBold ? bold : font;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (active.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  paragraphs.forEach((paragraph, index) => {
    const isTitle = index === 0;
    const isSignature = index >= paragraphs.length - 2;
    const size = isTitle ? 16 : 12;
    const useBold = isTitle || isSignature;
    const lines = wrap(paragraph, size, useBold);
    for (const line of lines) {
      const active = useBold ? bold : font;
      const width = active.widthOfTextAtSize(line, size);
      const x = isTitle ? (595.28 - width) / 2 : marginX;
      page.drawText(line, {
        x,
        y,
        size,
        font: active,
        color: rgb(0.08, 0.08, 0.1),
      });
      y -= size + 6;
    }
    y -= isTitle ? 18 : 12;
  });

  void formatLeaveDocumentDate;
  return Buffer.from(await pdf.save());
}

export async function buildLeaveAttestationPdfBuffer(
  data: LeaveAttestationFormData,
): Promise<Buffer> {
  if (isWindows()) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leave-attestation-pdf-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    try {
      await writeDocxFromTemplate(LEAVE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
        fillLeaveAttestationXml(xml, data),
      );
      const pdfPath = path.join(tempDir, 'attestation.pdf');
      await convertDocxToPdf(docxPath, pdfPath);
      return Buffer.from(await fs.readFile(pdfPath));
    } catch {
      return buildLeaveAttestationPdfWithPdfLib(data);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return buildLeaveAttestationPdfWithPdfLib(data);
}
