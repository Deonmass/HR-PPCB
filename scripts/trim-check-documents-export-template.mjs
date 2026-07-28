/**
 * Trim CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx: remove 1M+ empty row tags that
 * make xlsx-populate take minutes to load. Keeps real data + formulas (~rows 1–200).
 *
 * Usage: node scripts/trim-check-documents-export-template.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, '..', 'Excel', 'templates', 'check-documents', 'CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx');
const KEEP_THROUGH_ROW = Number(process.env.CHECK_DOCS_TEMPLATE_MAX_ROW || 250);

const buf = fs.readFileSync(TEMPLATE);
const zip = await JSZip.loadAsync(buf);
const sheetPath = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
if (!sheetPath) {
  console.error('Aucune feuille trouvée dans le template');
  process.exit(1);
}

const xml = await zip.file(sheetPath).async('string');
console.log(`Avant : ${(xml.length / 1e6).toFixed(2)} MB XML`);

const dimMatch = xml.match(/<dimension[^>]*ref="([^"]+)"/);
console.log('dimension avant:', dimMatch?.[1]);

// Keep rows with r <= KEEP_THROUGH_ROW; drop empty filler rows beyond.
const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g;
let kept = 0;
let dropped = 0;
let maxKept = 0;
const cleaned = xml.replace(rowRe, (full, rStr) => {
  const r = Number(rStr);
  if (r <= KEEP_THROUGH_ROW) {
    kept += 1;
    if (r > maxKept) maxKept = r;
    return full;
  }
  dropped += 1;
  return '';
});

const newDim = `A1:AD${Math.max(maxKept, KEEP_THROUGH_ROW)}`;
const withDim = cleaned.replace(
  /<dimension[^>]*\/>/,
  `<dimension ref="${newDim}"/>`,
);

console.log(`Lignes gardées: ${kept} (max r=${maxKept}), supprimées: ${dropped}`);
console.log(`Après : ${(withDim.length / 1e6).toFixed(2)} MB XML, dimension=${newDim}`);

zip.file(sheetPath, withDim);
const out = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
fs.writeFileSync(TEMPLATE, out);
console.log(`Template trimé : ${TEMPLATE} (${(out.length / 1e6).toFixed(2)} MB)`);
