/**
 * Vérifie que les recherches/remplacements des documents employé (appraisal + exit)
 * matchent bien les modèles Word réels. Usage : node scripts/test-employee-docs.mjs
 */
import fs from 'fs';
import JSZip from 'jszip';
import { buildConfirmationParagraphParts } from '../lib/confirmation-letter.ts';
import { fillDocxBlankAfterLabel, replaceDocxSpanWithRuns, replaceDocxText } from '../lib/docx-fill.ts';
import { formatAttestationAgentName, formatAttestationNom } from '../lib/format-display-name.ts';

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
  out = check('attestation / civilité+nom', () => replaceDocxText(out, 'Monsieur Jerry BUHENDWA', 'Monsieur Kamba MUKENDI')) ?? out;
  out = check('attestation / cnss', () => replaceDocxText(out, '1199046614B', '123456789')) ?? out;
  out = check('attestation / date embauche', () => replaceDocxText(out, '1er décembre 2025', '1er février 2020')) ?? out;
  out = check('attestation / date fin', () => replaceDocxText(out, '27 novembre 2026', '31 juillet 2026', { occurrence: 1 })) ?? out;
  out = check('attestation / date document', () => replaceDocxText(out, '28 octobre 2026', '31 juillet 2026', { occurrence: 1 })) ?? out;
  out = check('attestation / fonction', () => replaceDocxText(out, 'Supply Chain Officer', 'HR Officer')) ?? out;
  const text = extractText(out);
  if (text.includes('27 novembre 2026') || text.includes('28 octobre 2026') || text.includes('BUHENDWA')) {
    failures += 1;
    console.log('FAIL  attestation / il reste une valeur exemple');
  }
  if (!text.includes('ATTESTATION DE FIN DE SERVICE') || !text.includes('occupait, à la fin de son service, le poste') || !text.includes('La présente')) {
    failures += 1;
    console.log('FAIL  attestation / formulation du modèle absente');
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

// ── Lettre de confirmation ──
{
  const TEMPLATE_BODY =
    "Suite à l'évaluation favorable de vos prestations durant la période d'essai prévue à votre contrat de travail, nous avons le plaisir de vous confirmer dans vos fonctions de Revenue & Inventory Controller au sein de PPC Barnet DRC Manufacturing S.A, avec effet au 1 novembre 2026.";
  const xml = await loadXml('Excel/templates/documents/Template Confirmation letter.docx');
  const parts = buildConfirmationParagraphParts({
    trialMonths: 3,
    trialStartLabel: '12 août 2026',
    jobTitle: 'Lab Analyst',
    companyLegal: 'PPC Barnet DRC Manufacturing S.A',
    effectLabel: '12 novembre 2026',
  });
  const out = check('confirmation / paragraphe', () => replaceDocxSpanWithRuns(xml, TEMPLATE_BODY, TEMPLATE_BODY, parts));
  const text = out ? extractText(out) : '';
  const expected =
    'Suite à l’évaluation satisfaisante de vos performances au cours de la période d’essai de trois (3) mois prévus par votre contrat de travail, débutée le 12 août 2026, nous avons le plaisir de vous confirmer dans vos fonctions de Lab Analyst au sein de PPC Barnet DRC Manufacturing S.A., avec effet au 12 novembre 2026.';
  if (!text.includes(expected)) {
    failures += 1;
    console.log('FAIL  confirmation / phrase attendue absente');
  }
  if (text.includes('Revenue') || text.includes('évaluation favorable')) {
    failures += 1;
    console.log('FAIL  confirmation / ancien paragraphe encore présent');
  }
  const boldText = out
    ? [...out.matchAll(/<w:b\/>[\s\S]*?<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('|')
    : '';
  for (const value of ['Lab Analyst', 'PPC Barnet DRC Manufacturing S.A.', '12 novembre 2026']) {
    if (!boldText.includes(value)) {
      failures += 1;
      console.log(`FAIL  confirmation / pas en gras : ${value}`);
    }
  }
  if (formatAttestationAgentName('EWULI SUKA CARINE') !== 'Carine EWULI SUKA') {
    failures += 1;
    console.log('FAIL  confirmation / signataire Prenom NOM POSTNOM');
  }
  if (formatAttestationNom('MASSADI GEDEON GEDEON') !== 'Massadi') {
    failures += 1;
    console.log('FAIL  confirmation / appel nom seul');
  }
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les remplacements matchent.');
process.exit(failures ? 1 : 0);
