import 'server-only';

import path from 'path';
import type { Employee } from './types';
import { fillDocxTemplateToBuffer } from './docx-template';
import {
  civilityFromGender,
  computeResignationNotice,
  employerSiteLabel,
  fillReponseDemissionXml,
  formatLetterName,
  isNoticeBand,
  noticeBandFromGrade,
  parseFlexibleDate,
  type NoticeBand,
} from './reponse-demission';

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'Excel',
  'templates',
  'exit',
  'reponse-demission.docx',
);

export interface ReponseDemissionRequest {
  documentDate?: string;
  resignationDate?: string;
  desiredEndDate?: string;
  band?: string;
  unionDelegate?: boolean;
}

function requireDate(value: string | undefined, label: string): Date {
  const date = parseFlexibleDate(value || '');
  if (!date) throw new Error(`${label} invalide`);
  return date;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateReponseDemission(
  employee: Employee,
  request: ReponseDemissionRequest,
): Promise<{ buffer: Buffer; fileName: string }> {
  const hire = parseFlexibleDate(employee.appointmentDate || '');
  if (!hire) {
    throw new Error('Date d’engagement manquante sur la fiche de l’employé');
  }

  const requestedBand = (request.band || '').trim();
  const band: NoticeBand | null = requestedBand
    ? (isNoticeBand(requestedBand) ? requestedBand : null)
    : noticeBandFromGrade(employee.grade || '');
  if (!band) {
    throw new Error('Catégorie de préavis introuvable. Choisissez Classifié, Maîtrise ou Cadre.');
  }

  const documentDate = requireDate(request.documentDate, 'Date de la réponse');
  const resignationDate = requireDate(request.resignationDate, 'Date de la lettre de démission');
  const desiredEndDate = requireDate(request.desiredEndDate, 'Date de départ souhaitée');
  const notice = computeResignationNotice(band, hire, resignationDate, request.unionDelegate === true);

  const buffer = await fillDocxTemplateToBuffer(TEMPLATE_PATH, (xml) =>
    fillReponseDemissionXml(xml, {
      civility: civilityFromGender(employee.gender || ''),
      letterName: formatLetterName(employee.nom),
      jobTitle: employee.jobTitle || employee.position || '',
      matricule: employee.matricule,
      site: employerSiteLabel(employee.company || '', employee.localisation || ''),
      documentDate,
      resignationDate,
      desiredEndDate,
      notice,
    }),
  );

  return {
    buffer,
    fileName: sanitizeFileName(`Réponse démission - ${employee.nom || employee.matricule}.docx`),
  };
}
