/**
 * Crée le modèle attestation de résidence (texte officiel capt1) depuis congé.
 * node scripts/build-attestation-residence-template.mjs
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const src = path.join(process.cwd(), 'Excel', 'templates', 'attestations', 'attestation-conge.docx');
const out = path.join(process.cwd(), 'Excel', 'templates', 'attestations', 'attestation-residence.docx');

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceLiteral(xml, literal, value) {
  const chars = literal.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const gap = '(?:<[^>]+>)*';
  const pattern = new RegExp(chars.join(gap));
  const match = pattern.exec(xml);
  if (!match) {
    console.warn('NOT FOUND:', literal);
    return xml;
  }
  return `${xml.slice(0, match.index)}${escapeXml(value)}${xml.slice(match.index + match[0].length)}`;
}

const buf = fs.readFileSync(src);
const zip = await JSZip.loadAsync(buf);
let xml = await zip.file('word/document.xml').async('string');

xml = replaceLiteral(xml, 'ATTESTATION DE CONGE', 'ATTESTATION DE RESIDENCE');
xml = replaceLiteral(xml, 'Je soussigné,', 'Je [soussigne],');
xml = replaceLiteral(xml, '[Fonction] au sein de notre entreprise, ', '');
xml = replaceLiteral(
  xml,
  'sera en congé à partir du [date_debut] et reprendra le travail en date du [date_fin].',
  'employé dans notre entreprise, réside effectivement au [adresse].',
);

const emptyMarker = 'w14:paraId="688B8B12"';
const emptyIdx = xml.indexOf(emptyMarker);
if (emptyIdx >= 0 && !xml.includes('La présente lui est délivrée')) {
  const close = xml.indexOf('</w:p>', emptyIdx);
  const insert =
    '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/><w:bCs/><w:sz w:val="24"/><w:lang w:val="fr-FR"/></w:rPr><w:t>La présente lui est délivrée pour faire valoir ce que de droit.</w:t></w:r>';
  xml = `${xml.slice(0, close)}${insert}${xml.slice(close)}`;
}

zip.file('word/document.xml', xml);
fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }));
console.log('Updated', out);

const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
console.log(texts.join(' || '));
