/**
 * Convertit le modèle attestation congé (échantillon Carine) en placeholders […].
 * node scripts/build-attestation-conge-template.mjs
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const src = path.join(process.cwd(), 'Excel', 'templates', 'attestations', 'attestation-conge.docx');
const out = src;

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

const replacements = [
  ['Kiesse BANGULI', '[Nom complet HoD]'],
  ['Payroll & Admin Manager', '[Fonction HoD]'],
  ['Mme MIRINDI IRAGI Carine', '[Genre employe] [Nom complet employe]'],
  ['HR Officer', '[Fonction]'],
  ['23 juin 2026', '[date_debut]'],
  ['6 juillet 2026', '[date_fin]'],
  ['15 juin 2025', '[DATE]'],
  ['Kiesse BANGULI', '[Nom complet HoD]'],
  ['Payroll & Admin Manager', '[Fonction HoD]'],
];

for (const [from, to] of replacements) {
  xml = replaceLiteral(xml, from, to);
}

zip.file('word/document.xml', xml);
const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
fs.writeFileSync(out, outBuf);
console.log('Updated', out);

const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
console.log(texts.join('|'));
