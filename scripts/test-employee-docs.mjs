/**
 * Vérifie que les recherches/remplacements des documents employé (appraisal + exit)
 * matchent bien les modèles Word réels. Usage : node scripts/test-employee-docs.mjs
 */
import fs from 'fs';
import JSZip from 'jszip';
import { fillDocxBlankAfterLabel, replaceDocxText } from '../lib/docx-fill.ts';

async function loadXml(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return zip.file('word/document.xml').async('string');
}

function extractText(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

let failures = 0;
function check(name, fn) {
  try {
    const result = fn();
    console.log(`OK    ${name}`);
    return result;
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}: ${err.message}`);
    return null;
  }
}

// ── Interim appraisal ──
{
  const xml = await loadXml('Excel/templates/appraisal/Interim appraisal evaluation.docx');
  let out = xml;
  out = check('appraisal / name', () => fillDocxBlankAfterLabel(out, 'the employee: ', 'KAMBA MUKENDI Jean')) ?? out;
  out = check('appraisal / position', () => fillDocxBlankAfterLabel(out, 'Position: ', 'HR Officer')) ?? out;
  const text = extractText(out);
  if (!text.includes('KAMBA MUKENDI Jean') || !text.includes('HR Officer')) {
    failures += 1;
    console.log('FAIL  appraisal / valeurs absentes du résultat');
  }
}

// ── Clearance ──
{
  const xml = await loadXml('Excel/templates/exit/Employee exit clearance form.docx');
  let out = xml;
  for (const [label, value] of [
    ['Name: ', 'KAMBA MUKENDI Jean'],
    ['Last working day: ', '31/07/2026'],
    ['Company joined date: ', '01/02/2020'],
    ['Last date service: ', '31/07/2026'],
    ['Designation/ Position: ', 'HR Officer'],
    ['Employee number: ', '70001234'],
    ['Department :', 'Human Resources'],
  ]) {
    out = check(`clearance / ${label.trim()}`, () => fillDocxBlankAfterLabel(out, label, value)) ?? out;
  }
}

// ── Interview ──
{
  const xml = await loadXml('Excel/templates/exit/Exit interview form.docx');
  let out = xml;
  for (const [search, value] of [
    ['Ndusha Clement', 'KAMBA MUKENDI Jean'],
    ['70000273', '70001234'],
    ['18 December 1999', '5 March 1990'],
    ['Process Technician', 'HR Officer'],
    ['Optimization', 'Human Resources'],
    ['Zamba', 'Kinshasa'],
    ['2 year, 2 months', '6 years, 5 months'],
    ['03/06/2024', '01/02/2020'],
    ['16/07/2026', '31/07/2026'],
  ]) {
    out = check(`interview / ${search}`, () => replaceDocxText(out, search, value)) ?? out;
  }
}

// ── Attestation fin de service ──
{
  const xml = await loadXml('Excel/templates/exit/Attestation de fin de service.docx');
  let out = xml;
  out = check('attestation / civilité+nom', () => replaceDocxText(out, 'Monsieur BAZOLA NDELO Serge', 'Monsieur KAMBA MUKENDI Jean')) ?? out;
  out = check('attestation / cnss', () => replaceDocxText(out, '102329119830718004', '123456789')) ?? out;
  out = check('attestation / date embauche', () => replaceDocxText(out, '03 novembre 2025', '1er février 2020')) ?? out;
  out = check('attestation / date fin (occ 1)', () => replaceDocxText(out, '2 mai 2026', '31 juillet 2026', { occurrence: 1 })) ?? out;
  out = check('attestation / date document (occ 1 restante)', () => replaceDocxText(out, '2 mai 2026', '31 juillet 2026', { occurrence: 1 })) ?? out;
  out = check('attestation / fonction', () => replaceDocxText(out, 'Head of Sales & Marketing', 'HR Officer')) ?? out;
  const text = extractText(out);
  if (text.includes('2 mai 2026')) {
    failures += 1;
    console.log('FAIL  attestation / il reste une date exemple');
  }
}

// ── User removal ──
{
  const xml = await loadXml('Excel/templates/exit/User Removal Form.docx');
  let out = xml;
  out = check('removal / nom MAJ', () => replaceDocxText(out, 'NDUSHA CLEMENT', 'KAMBA MUKENDI JEAN')) ?? out;
  out = check('removal / nom bas', () => replaceDocxText(out, 'Ndusha Clement', 'Kamba Mukendi Jean')) ?? out;
  out = check('removal / fonction', () => replaceDocxText(out, 'Process Technician', 'HR Officer')) ?? out;
  out = check('removal / site', () => replaceDocxText(out, 'Zamba', 'Kinshasa')) ?? out;
  out = check('removal / dept', () => replaceDocxText(out, 'Optimization', 'Human Resources')) ?? out;
  out = check('removal / manager 1', () => replaceDocxText(out, 'PARICIAN UCCHI', 'JOHN DOE')) ?? out;
  out = check('removal / manager 2', () => replaceDocxText(out, 'Patrick Kahasha Mbasha', 'John Doe', { optional: true })) ?? out;
  out = check('removal / cost centre', () => replaceDocxText(out, 'KM5910', 'KM1234')) ?? out;
  out = check('removal / date app (occ 1)', () => replaceDocxText(out, '16.07.2026', '31.07.2026', { occurrence: 1 })) ?? out;
  out = check('removal / date term (occ 1 restante)', () => replaceDocxText(out, '16.07.2026', '30.09.2026', { occurrence: 1 })) ?? out;
  out = check('removal / dates signature (all)', () => replaceDocxText(out, '15.07.2026', '31.07.2026', { occurrence: 'all' })) ?? out;
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les remplacements matchent.');
process.exit(failures ? 1 : 0);
