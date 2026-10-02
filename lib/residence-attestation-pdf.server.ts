import 'server-only';

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeDocxFromTemplate } from './docx-template';
import { PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import { splitBilingualResidenceForm } from './residence-attestation-text';
import {
  buildResidenceAttestationParagraphs,
  fillBilingualResidenceAttestationXml,
  fillResidenceAttestationXml,
  formatResidenceDocumentDate,
  loadResidenceAttestationHeaderImage,
  RESIDENCE_ATTESTATION_TEMPLATE_PATH,
} from './residence-attestation-template';
import type { ResidenceAttestationFormData } from './residence-attestation-types';
import { toWinAnsi } from './pdf-winansi';
import { convertDocxToPdf } from './travel-pdf';
import { isWindows } from './windows-shell';

async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return Buffer.from(await merged.save());
}

async function buildResidenceAttestationPdfWithPdfLib(
  data: ResidenceAttestationFormData,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const marginX = 64;
  const maxWidth = 595.28 - marginX * 2;

  const headerImage = await loadResidenceAttestationHeaderImage();
  let embeddedHeader:
    | Awaited<ReturnType<PDFDocument['embedPng']>>
    | Awaited<ReturnType<PDFDocument['embedJpg']>>
    | null = null;
  if (headerImage) {
    embeddedHeader =
      headerImage.mime === 'image/png'
        ? await pdf.embedPng(headerImage.bytes)
        : await pdf.embedJpg(headerImage.bytes);
  }

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

  const drawPage = (pageData: ResidenceAttestationFormData) => {
    const page = pdf.addPage([595.28, 841.89]);
    let y = 800;
    let logoBottomY = y;

    if (embeddedHeader) {
      const width = Math.min(210, maxWidth * 0.42);
      const height = (embeddedHeader.height / embeddedHeader.width) * width;
      const logoY = y - height;
      page.drawImage(embeddedHeader, {
        x: marginX,
        y: logoY,
        width,
        height,
      });
      logoBottomY = logoY;
    }

    const addressSize = 8;
    const addressLineH = 10;
    let addressY = y - 2;
    for (const raw of PPC_LETTERHEAD_ADDRESS_LINES) {
      const line = toWinAnsi(raw);
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

    const paragraphs = buildResidenceAttestationParagraphs(pageData);
    paragraphs.forEach((paragraph, index) => {
      const isTitle = index === 0;
      const isSignature = index >= paragraphs.length - 2;
      const size = isTitle ? 16 : 12;
      const useBold = isTitle || isSignature;
      const lines = wrap(toWinAnsi(paragraph), size, useBold);
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
  };

  if (data.language === 'both') {
    const { fr, en } = splitBilingualResidenceForm(data);
    drawPage(fr);
    drawPage(en);
  } else {
    drawPage(data);
  }

  void formatResidenceDocumentDate;
  return Buffer.from(await pdf.save());
}

export async function buildResidenceAttestationPdfBuffer(
  data: ResidenceAttestationFormData,
): Promise<Buffer> {
  if (isWindows()) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'residence-attestation-pdf-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    try {
      if (data.language === 'both') {
        const { fr, en } = splitBilingualResidenceForm(data);
        await writeDocxFromTemplate(RESIDENCE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
          fillBilingualResidenceAttestationXml(xml, fr, en),
        );
      } else {
        await writeDocxFromTemplate(RESIDENCE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
          fillResidenceAttestationXml(xml, data),
        );
      }
      const pdfPath = path.join(tempDir, 'attestation.pdf');
      await convertDocxToPdf(docxPath, pdfPath);
      return Buffer.from(await fs.readFile(pdfPath));
    } catch {
      return buildResidenceAttestationPdfWithPdfLib(data);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (data.language === 'both') {
    const { fr, en } = splitBilingualResidenceForm(data);
    const [frBuf, enBuf] = await Promise.all([
      buildResidenceAttestationPdfWithPdfLib(fr),
      buildResidenceAttestationPdfWithPdfLib(en),
    ]);
    return mergePdfBuffers([frBuf, enBuf]);
  }

  return buildResidenceAttestationPdfWithPdfLib(data);
}
