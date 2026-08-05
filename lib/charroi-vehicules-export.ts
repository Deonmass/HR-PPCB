import XLSX from 'xlsx-js-style';
import type { CharroiDocKind, CharroiDocPaiement, CharroiVehicule } from './charroi-types';
import {
  CHARROI_DOC_LABELS,
  charroiDaysRemaining,
  formatCharroiDate,
  formatCharroiRemaining,
  getVehiculeDocHistorique,
} from './charroi-types';

const VEHICULE_HEADERS = [
  'N°',
  'Marque',
  'Type',
  'N° châssis',
  'Plaque',
  'CV',
  'Assureur',
  'Département',
  'Responsable',
  'Province',
  'Propriétaire',
  'Kilométrage',
  'Mise en circulation',
  'Âge',
  'Assurance (fin)',
  'Vignette (fin)',
  'Contrôle technique (fin)',
  'État technique',
  'Notes',
] as const;

const HIST_HEADERS = [
  'N° véhicule',
  'Marque',
  'Plaque',
  'Département',
  'Responsable',
  'Province',
  'Date début',
  'Date fin',
  'Temps restant',
  'URL preuve',
  'Enregistré le',
] as const;

function sheetNameSafe(name: string): string {
  // Excel sheet name max 31 chars, no : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
}

function buildVehiclesSheet(items: CharroiVehicule[]): XLSX.WorkSheet {
  const rows = items.map((v) => [
    v.numero ?? '',
    v.marque || '',
    v.type || '',
    v.numeroChassis || '',
    v.plaque || '',
    v.cv || '',
    v.assureur || '',
    v.departement || '',
    v.user || '',
    v.province || '',
    v.proprietaire || '',
    v.kilometrage ?? '',
    v.miseCirculation || '',
    v.age ?? '',
    formatCharroiDate(v.assuranceFin) || '',
    formatCharroiDate(v.vignetteFin) || '',
    formatCharroiDate(v.controleTechniqueFin) || '',
    v.observationTech || '',
    v.notes || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    [...VEHICULE_HEADERS],
    ...rows,
  ]);
  ws['!cols'] = [
    6, 16, 12, 18, 12, 8, 14, 16, 18, 12, 10, 12, 12, 6, 12, 12, 14, 14, 24,
  ].map((wch) => ({ wch }));
  return ws;
}

function formatCreatedAt(iso: string): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function historyRowsFor(
  items: CharroiVehicule[],
  kind: CharroiDocKind,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const v of items) {
    for (const entry of getVehiculeDocHistorique(v, kind)) {
      rows.push(historyRow(v, entry));
    }
  }
  return rows;
}

function historyRow(v: CharroiVehicule, entry: CharroiDocPaiement): (string | number)[] {
  const days = charroiDaysRemaining(entry.dateFin);
  return [
    v.numero ?? '',
    v.marque || '',
    v.plaque || '',
    v.departement || '',
    v.user || '',
    v.province || '',
    formatCharroiDate(entry.dateDebut) || '',
    formatCharroiDate(entry.dateFin) || '',
    formatCharroiRemaining(days),
    entry.preuveUrl || '',
    formatCreatedAt(entry.createdAt),
  ];
}

function buildHistorySheet(items: CharroiVehicule[], kind: CharroiDocKind): XLSX.WorkSheet {
  const rows = historyRowsFor(items, kind);
  const ws = XLSX.utils.aoa_to_sheet([
    [...HIST_HEADERS],
    ...rows,
  ]);
  ws['!cols'] = [10, 16, 12, 16, 18, 12, 12, 12, 18, 36, 16].map((wch) => ({ wch }));
  return ws;
}

/** Export Excel des véhicules + historiques ass. / vignette / contr. tech. */
export function downloadVehiculesExport(
  items: CharroiVehicule[],
  options?: { filename?: string; sheetName?: string },
): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    buildVehiclesSheet(items),
    sheetNameSafe(options?.sheetName || 'Véhicules'),
  );

  const histSheets: { kind: CharroiDocKind; name: string }[] = [
    { kind: 'assurance', name: 'Historique assurances' },
    { kind: 'vignette', name: 'Historique vignettes' },
    { kind: 'controleTechnique', name: 'Historique contr. tech.' },
  ];

  for (const { kind, name } of histSheets) {
    const ws = buildHistorySheet(items, kind);
    // Toujours ajouter la feuille (vide si aucune période) pour un export stable
    XLSX.utils.book_append_sheet(wb, ws, sheetNameSafe(name || CHARROI_DOC_LABELS[kind]));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, options?.filename || `base-vehicules-${stamp}.xlsx`);
}
