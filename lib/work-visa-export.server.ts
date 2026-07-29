import 'server-only';

import * as XLSX from 'xlsx-js-style';
import type { WorkVisaDossierView } from './work-visa-types';
import { formatDateFr } from './work-visa-validity';

function docCell(view: WorkVisaDossierView, kind: 'passport' | 'workVisa' | 'workCard' | 'vsr'): string {
  const slot =
    kind === 'passport'
      ? view.passport
      : kind === 'workVisa'
        ? view.workVisa
        : kind === 'workCard'
          ? view.workCard
          : view.vsr;
  const validity =
    kind === 'passport'
      ? view.passportValidity
      : kind === 'workVisa'
        ? view.workVisaValidity
        : kind === 'workCard'
          ? view.workCardValidity
          : view.vsrValidity;
  if (!slot.current) return '—';
  return `${slot.current.number} (${validity.label} · ${formatDateFr(slot.current.expiryDate)})`;
}

export function buildWorkVisaExportBuffer(dossiers: WorkVisaDossierView[]): Buffer {
  const header = [
    'Matricule',
    'Nom',
    'Prénom',
    'Centre de coût',
    'Sexe',
    'Nationalité',
    'Expatrié',
    'Passeport',
    'Visa',
    'Carte travail',
    'VSR',
    'Validité visa',
    'Statut dossier',
  ];

  const rows = dossiers.map((d) => [
    d.matricule,
    d.nom,
    d.prenom,
    d.centreCout,
    d.sexe,
    d.nationalite,
    d.isExpat ? 'Oui' : 'Non',
    docCell(d, 'passport'),
    docCell(d, 'workVisa'),
    docCell(d, 'workCard'),
    docCell(d, 'vsr'),
    d.workVisaValidity.label,
    d.status === 'actif' ? 'Actif' : 'Inactif',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Visas de travail');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
