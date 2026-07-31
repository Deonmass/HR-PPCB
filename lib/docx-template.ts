import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

const DOCUMENT_XML_PATH = 'word/document.xml';

export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function replaceOnce(source: string, search: string, replacement: string, fromIndex = 0): string {
  const index = source.indexOf(search, fromIndex);
  if (index < 0) {
    throw new Error(`Balise introuvable dans le modèle Word : ${search.slice(0, 80)}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

export function replaceFirstPreserveSpaceAfter(
  source: string,
  marker: string,
  value: string,
  fromIndex = 0,
): string {
  const markerIndex = source.indexOf(marker, fromIndex);
  if (markerIndex < 0) {
    throw new Error(`Marqueur introuvable dans le modèle Word : ${marker.slice(0, 80)}`);
  }
  const slot = '<w:t xml:space="preserve"> </w:t>';
  const slotIndex = source.indexOf(slot, markerIndex);
  if (slotIndex < 0) {
    throw new Error(`Emplacement de saisie introuvable après : ${marker.slice(0, 80)}`);
  }
  return replaceOnce(
    source,
    slot,
    `<w:t xml:space="preserve"> ${escapeXmlText(value)}</w:t>`,
    slotIndex,
  );
}

export function fillEmptyParagraph(
  source: string,
  paraId: string,
  value: string,
  options?: { font?: string; size?: string; bold?: boolean },
): string {
  const marker = `w14:paraId="${paraId}"`;
  const paraIndex = source.indexOf(marker);
  if (paraIndex < 0) {
    throw new Error(`Paragraphe introuvable : ${paraId}`);
  }
  const closePPrIndex = source.indexOf('</w:pPr>', paraIndex);
  if (closePPrIndex < 0) {
    throw new Error(`Style de paragraphe introuvable : ${paraId}`);
  }

  const font = options?.font ?? 'Arial';
  const size = options?.size ?? '24';
  const boldTags = options?.bold ? '<w:b/><w:bCs/>' : '';
  const run = `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${boldTags}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t>${escapeXmlText(value)}</w:t></w:r>`;

  return `${source.slice(0, closePPrIndex + 8)}${run}${source.slice(closePPrIndex + 8)}`;
}

export function formatEmployeeWithMatricule(name: string, matricule: string): string {
  const trimmedName = name.trim();
  const trimmedMatricule = matricule.trim();
  if (!trimmedMatricule) return trimmedName;
  return `${trimmedName} (${trimmedMatricule})`;
}

/** Variante en mémoire : renvoie le .docx rempli sous forme de Buffer. */
export async function fillDocxTemplateToBuffer(
  templatePath: string,
  fillXml: (xml: string) => string,
): Promise<Buffer> {
  const templateBuffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentFile) {
    throw new Error('Fichier word/document.xml introuvable dans le modèle');
  }

  const xml = await documentFile.async('string');
  zip.file(DOCUMENT_XML_PATH, fillXml(xml), { createFolders: false });

  for (const entryName of Object.keys(zip.files)) {
    if (zip.files[entryName].dir) {
      delete zip.files[entryName];
    }
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function writeDocxFromTemplate(
  templatePath: string,
  outputPath: string,
  fillXml: (xml: string) => string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const templateBuffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentFile) {
    throw new Error('Fichier word/document.xml introuvable dans le modèle');
  }

  const xml = await documentFile.async('string');
  zip.file(DOCUMENT_XML_PATH, fillXml(xml), { createFolders: false });

  for (const entryName of Object.keys(zip.files)) {
    if (zip.files[entryName].dir) {
      delete zip.files[entryName];
    }
  }

  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  await fs.writeFile(path.resolve(outputPath), outputBuffer);
}
