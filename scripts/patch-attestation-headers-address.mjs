/**
 * Met à jour l'adresse d'en-tête des modèles d'attestation (Word).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ADDRESS_LINES = [
  'PPC Barnet DRC Manufacturing SA',
  '5ᵉ étage, Immeuble la Promenade 2,',
  'Croisement des avenues OUA et Massamba, Quartier  Basoko, Commune de Ngaliema.',
  'Email : Reception.HQ@ppcdrc.cd',
  'Tel  +243 899922864',
  'IDNAT ID 01-C2301-N79031Q',
  'RCCM 14-B-01677',
  'Numéro impot A1402387L',
];

const FILES = [
  'Excel/templates/attestations/Attestation de service .docx',
  'Excel/templates/attestations/attestation-conge.docx',
  'Excel/templates/exit/Attestation de fin de service.docx',
];

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function para(text, { first = false } = {}) {
  const style = first
    ? '<w:pStyle w:val="Tradingname"/>'
    : text.startsWith('IDNAT') || text.startsWith('RCCM') || text.startsWith('Numéro')
      ? '<w:pStyle w:val="Address"/>'
      : '';
  const rPr =
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="12"/><w:szCs w:val="12"/><w:lang w:val="en-US"/></w:rPr>';
  const pPr = `<w:pPr>${style}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rPr}</w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function buildTxbxContent() {
  const parts = ADDRESS_LINES.map((line, i) => para(line, { first: i === 0 }));
  parts.push(
    '<w:p><w:pPr><w:pStyle w:val="Address"/><w:spacing w:line="240" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:pPr></w:p>',
  );
  return `<w:txbxContent>${parts.join('')}</w:txbxContent>`;
}

function replaceAllTxbx(xml) {
  const next = buildTxbxContent();
  let count = 0;
  const out = xml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, () => {
    count += 1;
    return next;
  });
  return { out, count };
}

async function patchDocx(relPath) {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) {
    console.log('skip missing', relPath);
    return;
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const headerName = Object.keys(zip.files).find((k) => /^word\/header\d+\.xml$/i.test(k));
  if (!headerName) throw new Error(`no header in ${relPath}`);
  const xml = await zip.file(headerName).async('string');
  const { out, count } = replaceAllTxbx(xml);
  if (!count) throw new Error(`no txbxContent in ${relPath}`);
  if (/Monjiba|COTEX/.test(out)) {
    console.warn('WARN leftover Monjiba/COTEX markers:', relPath);
  }
  zip.file(headerName, out);
  const newBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(filePath, newBuf);
  console.log('patched', relPath, `txbx=${count}`);
}

for (const file of FILES) {
  await patchDocx(file);
}
