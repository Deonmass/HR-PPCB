import 'server-only';

import JSZip from 'jszip';
import fs from 'fs/promises';
import { CLASSIFICATION_RULES, formatCategoryLine } from './convention-collective-rules';
import {
  formatMaritalStatusFr,
  formatPrestationLocation,
  splitPersonName,
} from './contrat-standard-family';
import {
  formatCdfAmount,
  formatUsdAmount,
  usdToWordsPhrase,
} from './contrat-standard-money';
import {
  annotateCddDurationLabel,
  type ContratDependantRow,
  type ContratStandardFormData,
} from './contrat-standard-types';
import { replaceDocxSpan, replaceDocxText } from './docx-fill';
import { fillDocxTemplateToBuffer, fillEmptyParagraph } from './docx-template';
import { CONTRAT_STANDARD_TEMPLATE_PATH } from './excel-export-template-paths';

/** Cellules vides du tableau « Personnes à charge » (lignes 2–4 du modèle). */
const DEPENDANT_EMPTY_CELLS: Array<{
  prenom: string;
  nom: string;
  postNom: string;
  birth: string;
}> = [
  { prenom: '697F9101', nom: '5DEAC986', postNom: '134204AE', birth: '66BA495F' },
  { prenom: '7B2748C7', nom: '2D1FECB6', postNom: '3CC8C3AE', birth: '7D07C193' },
  { prenom: '777A9F1E', nom: '36372D59', postNom: '7DD37516', birth: '343FD151' },
];

const APOS = '\u2019';

/** Bloc employeur du modèle — à conserver intégralement, hors représentant. */
const EMPLOYER_BLOCK_START = 'La soci\u00e9t\u00e9 PPC BARNET DRC MANUFACTURING S A';
const EMPLOYER_BLOCK_END = `ayant pouvoir a l${APOS}effet des pr\u00e9sentes`;

function buildEmployerPreamble(signerName: string, signerTitle: string): string {
  return (
    `La soci\u00e9t\u00e9 PPC BARNET DRC MANUFACTURING S A, avec Conseil d${APOS}Administration au capital social de CDF 20.052.125.000, ayant son si\u00e8ge social au 5eme \u00e9tage, Immeuble D, Concession la promenade II, croisement des avenues OUA et Massamba, Quartier Basoko dans la commune de Ngaliema, \u00e0 Kinshasa, R\u00e9publique D\u00e9mocratique du Congo,  Immatricul\u00e9e au Registre de Commerce et de Credit Mobilier (RCCM) sous le num\u00e9ro 14-B-01677, dont le num\u00e9ro d${APOS} Identification Nationale est 01-C2301-N79031 Q et le num\u00e9ro d${APOS}imp\u00f4t A1402387L, affili\u00e9e \u00e0 la CNSS sous le N\u00b0 1003780600, repr\u00e9sent\u00e9e par ${signerName}, en qualit\u00e9 de ${signerTitle}, ayant pouvoir a l${APOS}effet des pr\u00e9sentes`
  );
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function parseIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatLongFr(date: Date | null, fallback = '—'): string {
  if (!date) return fallback;
  const day = date.getDate();
  return `${day === 1 ? '1er' : day} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function safe(value: string | null | undefined, fallback = '—'): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function monthsWord(months: number): string {
  return `${months} mois`;
}

function buildArticle1(form: ContratStandardFormData): string {
  const start = formatLongFr(parseIsoDate(form.startDate));
  const trial = monthsWord(form.trialMonths);
  if (form.contractType === 'CDI') {
    return (
      `Ce contrat est conclu pour une durée indéterminée à compter du ${start} `
      + `et assortie d’une période d’essai de ${trial}.`
    );
  }
  const duration = annotateCddDurationLabel(
    safe(form.contractDurationLabel, '1 an renouvelable'),
  );
  return (
    `Ce contrat est conclu pour une durée déterminée (${duration}) à compter du ${start} `
    + `et assortie d’une période d’essai de ${trial}.`
  );
}

function buildSalarySentence(form: ContratStandardFormData): string {
  const usd = Number(form.salaryUsd) || 0;
  const rate = Number(form.exchangeRate) || 0;
  const cdf = usd * rate;
  const usdFmt = formatUsdAmount(usd);
  const cdfFmt = formatCdfAmount(cdf);
  const words = usdToWordsPhrase(usd);
  return (
    `Il est alloué au travailleur une rémunération nette mensuelle de ${cdfFmt} `
    + `Francs Congolais/équivalent à USD ${usdFmt} (${words}).`
  );
}

function buildTitle(form: ContratStandardFormData): string {
  return form.contractType === 'CDI'
    ? 'CONTRAT DE TRAVAIL A DUREE INDETERMINEE'
    : 'CONTRAT DE TRAVAIL A DUREE DETERMINEE';
}

function depCell(value: string): string {
  return safe(value, '—');
}

type SplitDepRow = {
  prenom: string;
  nom: string;
  postNom: string;
  birthPlaceDate: string;
};

function splitDependantRow(row: ContratDependantRow | undefined): SplitDepRow {
  const parts = splitPersonName(row?.fullName || '');
  return {
    prenom: parts.prenom,
    nom: parts.nom,
    postNom: parts.postNom,
    birthPlaceDate: (row?.birthPlaceDate || '').trim(),
  };
}

function fillDependantRow0(xml: string, row: SplitDepRow): string {
  let out = xml;
  // Remplacer les 4 cellules de l’échantillon (y compris « Massadi », souvent oublié).
  out = replaceDocxText(out, 'Bryanna', depCell(row.prenom), { optional: true });
  out = replaceDocxText(out, 'Massadi', depCell(row.nom), { optional: true });
  out = replaceDocxText(out, 'Jayne', depCell(row.postNom), { optional: true });
  out = replaceDocxText(out, 'Kinshasa-04/08/2025', depCell(row.birthPlaceDate), {
    optional: true,
  });
  return out;
}

function fillDependantExtraRows(xml: string, rows: SplitDepRow[]): string {
  let out = xml;
  for (let i = 0; i < DEPENDANT_EMPTY_CELLS.length; i += 1) {
    const row = rows[i + 1];
    const cells = DEPENDANT_EMPTY_CELLS[i];
    if (!row || !cells) continue;
    const hasAny = [row.prenom, row.nom, row.postNom, row.birthPlaceDate].some((v) => v.trim());
    if (!hasAny) continue;
    try {
      out = fillEmptyParagraph(out, cells.prenom, depCell(row.prenom), {
        font: 'Times New Roman',
        size: '22',
      });
      out = fillEmptyParagraph(out, cells.nom, depCell(row.nom), {
        font: 'Times New Roman',
        size: '22',
      });
      out = fillEmptyParagraph(out, cells.postNom, depCell(row.postNom), {
        font: 'Times New Roman',
        size: '22',
      });
      out = fillEmptyParagraph(out, cells.birth, depCell(row.birthPlaceDate), {
        font: 'Times New Roman',
        size: '22',
      });
    } catch {
      // Cellules déjà remplies ou modèle divergé — ignorer.
    }
  }
  return out;
}

function fillBodyXml(xml: string, form: ContratStandardFormData): string {
  const rules = CLASSIFICATION_RULES[form.classification];
  const categoryLine = formatCategoryLine(form.classification, form.categoryCode);
  const jobTitle = safe(form.jobTitle, '—');
  const manager = safe(form.lineManagerTitle, '—');
  const location = formatPrestationLocation(form.workLocation);
  const marital = formatMaritalStatusFr(form.maritalStatus, form.civility);
  // Remplacer seulement la valeur modèle pour conserver tabulations / mise en forme.
  const nameLine = `${form.civility} : ${safe(form.employeeName)}`;

  let out = xml;
  out = replaceDocxText(out, 'CONTRAT DE TRAVAIL A DUREE DETERMINEE', buildTitle(form), {
    optional: true,
  });
  out = replaceDocxText(out, 'Monsieur/Madame : MASSADI Gedeon', nameLine, { optional: true });
  out = replaceDocxText(out, 'Monsieur/Madame\u00a0: MASSADI Gedeon', nameLine, { optional: true });
  out = replaceDocxText(out, 'MASSADI Gedeon', safe(form.employeeName), { optional: true });

  out = replaceDocxText(out, 'Congolaise', safe(form.nationality, 'Congolaise'), { optional: true });

  const birth = formatLongFr(parseIsoDate(form.birthDate), '—');
  out = replaceDocxText(out, '04 février 1994', birth, { optional: true });

  out = replaceDocxText(out, 'Marié', marital, { optional: true });

  // Adresse identité (en-tête) + Article 12 — remplacer la valeur modèle uniquement.
  out = replaceDocxText(
    out,
    '67, av Matadi, Q/Kilimani, C/ Kintambo- Kinshasa',
    safe(form.address),
    { optional: true },
  );
  out = replaceDocxText(
    out,
    '126, Av Baraka, Q/Mongala, C/Kinshasa- Kinshasa',
    safe(form.address),
    { optional: true },
  );

  out = replaceDocxText(out, '+243 81 451 10 83', safe(form.phone), { optional: true });
  out = replaceDocxText(out, 'gedeonmass44@gmail.com', safe(form.email), { optional: true });
  out = replaceDocxText(out, '11994769200I', safe(form.cnss), { optional: true });
  out = replaceDocxText(out, 'NN30020326449', safe(form.identityNumber), { optional: true });

  const spouse = splitPersonName(form.spouseFullName);
  out = replaceDocxText(out, 'Rebecca', safe(spouse.prenom, '—'), { optional: true });
  out = replaceDocxText(out, 'Maboso', safe(spouse.nom, '—'), { optional: true });
  out = replaceDocxText(out, 'Mombando', safe(spouse.postNom, '—'), { optional: true });

  const deps = (form.dependants.length ? form.dependants : [{ fullName: '', birthPlaceDate: '' }])
    .map(splitDependantRow);
  out = fillDependantRow0(out, deps[0] || { prenom: '', nom: '', postNom: '', birthPlaceDate: '' });
  out = fillDependantExtraRows(out, deps);

  out = replaceDocxText(
    out,
    'Ce contrat est conclu pour une durée déterminée (1 an renouvelable) à compter du 17 juin 2026 et assortie d’une période d’essai de 5 mois.',
    buildArticle1(form),
    { optional: true },
  );

  out = replaceDocxText(
    out,
    'en qualité de HR Admin. Il aura comme supérieur hiérarchique le Plant HR Manager.',
    `en qualité de ${jobTitle}. Il aura comme supérieur hiérarchique le ${manager}.`,
    { optional: true },
  );
  out = replaceDocxText(out, 'HR Admin', jobTitle, { occurrence: 'all', optional: true });
  out = replaceDocxText(
    out,
    'supérieur hiérarchique le Plant HR Manager',
    `supérieur hiérarchique le ${manager}`,
    { optional: true },
  );

  // Zamba → conserver / écrire « Kimpese (usine) » ; sinon remplacer le lieu modèle.
  if (!/^kimpese\s*\(usine\)$/i.test(location)) {
    out = replaceDocxText(
      out,
      'Le lieu des prestations est fixé à Kimpese (usine), RDC, ou tout autre lieu que l’employeur désignera.',
      `Le lieu des prestations est fixé à ${location}, RDC, ou tout autre lieu que l’employeur désignera.`,
      { optional: true },
    );
    out = replaceDocxText(out, 'Kimpese (usine)', location, { optional: true });
  }

  out = replaceDocxText(out, 'Catégorie : C1 (Agent de Maîtrise)', `Catégorie : ${categoryLine}`, {
    optional: true,
  });
  out = replaceDocxText(out, 'C1 (Agent de Maîtrise)', categoryLine, { optional: true });

  out = replaceDocxText(
    out,
    'Il est alloué au travailleur une rémunération nette mensuelle de 2,809,843 Francs Congolais/équivalent à USD 1,223 (Mille deux cent vingt-trois dollars américains).',
    buildSalarySentence(form),
    { optional: true },
  );

  // Période d’essai (art. 1 déjà traité + art. 5)
  out = replaceDocxText(
    out,
    'une période d’essai fixée à 5 mois',
    `une période d’essai fixée à ${monthsWord(form.trialMonths)}`,
    { occurrence: 'all', optional: true },
  );
  out = replaceDocxText(out, '5 mois', monthsWord(form.trialMonths), {
    occurrence: 'all',
    optional: true,
  });

  out = replaceDocxText(
    out,
    'un congé annuel d’une durée de 22 jours ouvrables',
    `un congé annuel d’une durée de ${form.leaveDays} jours ouvrables`,
    { optional: true },
  );
  out = replaceDocxText(out, '22 jours ouvrables', `${form.leaveDays} jours ouvrables`, {
    optional: true,
  });

  out = replaceDocxText(
    out,
    'Pour les agents de maitrise, la durée du préavis est fixée à un (1) mois. Cette durée est augmentée de neuf (9) jours ouvrables par année entière de services continus, comptée de date à date.',
    rules.noticeArticleSentence,
    { optional: true },
  );

  const docDate = formatLongFr(parseIsoDate(form.documentDate));
  out = replaceDocxText(out, 'Ainsi fait à Kinshasa, le 03 juin 2026.', `Ainsi fait à Kinshasa, le ${docDate}.`, {
    optional: true,
  });
  out = replaceDocxText(out, '03 juin 2026', docDate, { optional: true });

  // Bloc société conservé intégralement — seul le représentant (RH) est mis à jour, en dernier.
  if (form.signerName.trim()) {
    out = replaceDocxSpan(
      out,
      EMPLOYER_BLOCK_START,
      EMPLOYER_BLOCK_END,
      buildEmployerPreamble(
        form.signerName.trim(),
        form.signerTitle.trim() || 'Plant HR Manager',
      ),
      { optional: true },
    );
  }

  return out;
}

async function fillFooterJobTitle(buffer: Buffer, jobTitle: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/footer\d+\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    try {
      xml = replaceDocxText(xml, 'HR Admin', jobTitle, { occurrence: 'all', optional: true });
    } catch {
      // ignore
    }
    zip.file(name, xml);
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export interface GeneratedContratDoc {
  fileName: string;
  buffer: Buffer;
}

export async function generateContratStandard(
  form: ContratStandardFormData,
): Promise<GeneratedContratDoc> {
  const templatePath = CONTRAT_STANDARD_TEMPLATE_PATH;
  try {
    await fs.access(templatePath);
  } catch {
    throw new Error(
      'Modèle de contrat introuvable. Placez contrat-standard.docx dans Excel/templates/contrats/.',
    );
  }
  let buffer = await fillDocxTemplateToBuffer(templatePath, (xml) => fillBodyXml(xml, form));
  buffer = await fillFooterJobTitle(buffer, safe(form.jobTitle, 'Poste'));
  const kind = form.contractType === 'CDI' ? 'CDI' : 'CDD';
  return {
    fileName: sanitizeFileName(`Contrat ${kind} - ${form.employeeName || form.matricule}.docx`),
    buffer,
  };
}
