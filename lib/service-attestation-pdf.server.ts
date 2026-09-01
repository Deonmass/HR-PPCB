import 'server-only';

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeDocxFromTemplate } from './docx-template';
import { PPC_LETTERHEAD_ADDRESS_LINES } from './ppc-letterhead-address';
import {
  fillServiceAttestationXml,
  loadServiceAttestationHeaderImage,
  SERVICE_ATTESTATION_TEMPLATE_PATH,
} from './service-attestation-template';
import type { ServiceAttestationFormData } from './service-attestation-types';
import { toWinAnsi } from './pdf-winansi';
import { convertDocxToPdf } from './travel-pdf';
import { isWindows } from './windows-shell';

function formatDocumentDate(value: string, language: 'fr' | 'en'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Texte structuré de l’attestation (sans dépendre de Word/Office). */
export function buildServiceAttestationParagraphs(
  data: ServiceAttestationFormData,
): string[] {
  const hire = formatDocumentDate(data.dateEmbauche, data.language);
  const docDate = formatDocumentDate(data.documentDate, data.language);
  const dept = data.employeeDepartment.trim();
  const fn = data.employeeFunction.trim();
  const emp = data.employeeName.trim();
  const mat = data.employeeMatricule.trim();
  const hod = data.hodName.trim();
  const hodFn = data.hodFunction.trim();
  const empGenre = data.employeeGenre.trim();
  const hodGenre = data.hodGenre.trim();

  if (data.language === 'en') {
    return [
      'CERTIFICATE OF EMPLOYMENT',
      `I, the undersigned ${hodGenre} ${hod}, ${hodFn} of PPC Barnet DRC Manufacturing SA, hereby certify that ${empGenre} ${emp}, Employee ID ${mat}, has been employed by our company since ${hire} and currently holds the position of ${fn} in the department of ${dept}.`,
      'This certificate is issued upon request for whatever legal purpose it may serve.',
      `Done in Kinshasa, on ${docDate}.`,
      hod,
      hodFn,
    ];
  }

  return [
    'ATTESTATION DE SERVICE',
    `Je soussigné(e) ${hodGenre} ${hod}, ${hodFn} de PPC Barnet DRC Manufacturing SA, atteste par la présente que ${empGenre} ${emp}, Matricule ${mat}, est employé(e) dans notre entreprise depuis le ${hire} et occupe actuellement le poste de ${fn} au sein du département de ${dept}.`,
    'La présente lui est délivrée pour faire valoir ce que de droit.',
    `Fait à Kinshasa, le ${docDate}.`,
    hod,
    hodFn,
  ];
}

async function buildServiceAttestationPdfWithPdfLib(
  data: ServiceAttestationFormData,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const marginX = 64;
  const maxWidth = 595.28 - marginX * 2;
  let y = 800;

  const headerImage = await loadServiceAttestationHeaderImage();
  const addressSize = 8;
  const addressLineH = 10;
  let logoBottomY = y;

  if (headerImage) {
    const embedded =
      headerImage.mime === 'image/png'
        ? await pdf.embedPng(headerImage.bytes)
        : await pdf.embedJpg(headerImage.bytes);
    const imgW = embedded.width;
    const imgH = embedded.height;
    const targetW = Math.min(210, maxWidth * 0.42);
    const scale = targetW / imgW;
    const drawH = imgH * scale;
    const logoY = y - drawH;
    page.drawImage(embedded, {
      x: marginX,
      y: logoY,
      width: targetW,
      height: drawH,
    });
    logoBottomY = logoY;
  }

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

  const paragraphs = buildServiceAttestationParagraphs(data);

  const wrap = (text: string, size: number, useBold: boolean): string[] => {
    const f = useBold ? bold : font;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };

  paragraphs.forEach((paragraph, index) => {
    const isTitle = index === 0;
    const isSignature = index >= paragraphs.length - 2;
    const size = isTitle ? 16 : 12;
    const useBold = isTitle || isSignature;
    const lines = wrap(toWinAnsi(paragraph), size, useBold);
    const lineHeight = size + 6;

    if (isTitle) y -= 12;
    if (index === 1) y -= 18;
    if (index === paragraphs.length - 2) y -= 36;

    for (const line of lines) {
      if (y < 64) break;
      const f = useBold ? bold : font;
      const width = f.widthOfTextAtSize(line, size);
      const x = isTitle || isSignature ? (595.28 - width) / 2 : marginX;
      page.drawText(line, {
        x,
        y,
        size,
        font: f,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= lineHeight;
    }
    y -= isTitle ? 20 : 14;
  });

  return Buffer.from(await pdf.save());
}

/** PDF fidèle au modèle Word (Office sous Windows), sinon pdf-lib + en-tête image. */
export async function buildServiceAttestationPdfBuffer(
  data: ServiceAttestationFormData,
): Promise<Buffer> {
  if (isWindows()) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'service-attestation-pdf-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    const pdfPath = path.join(tempDir, 'out.pdf');
    try {
      await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
        fillServiceAttestationXml(xml, data),
      );
      await convertDocxToPdf(docxPath, pdfPath);
      return await fs.readFile(pdfPath);
    } catch {
      // Office indisponible → repli pdf-lib
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return buildServiceAttestationPdfWithPdfLib(data);
}
