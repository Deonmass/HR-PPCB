import XLSX from 'xlsx-js-style';
import {
  CHARROI_VOYAGE_STATUSES,
  voyageBudgetTotal,
  type CharroiVoyage,
} from './charroi-types';

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

const HEADERS = [
  'N°',
  'Statut',
  'Passager',
  'Matricule',
  'Passager type',
  'Personnes',
  'Lieu de départ',
  'Destination',
  'Trajet',
  'Date départ',
  'Heure départ',
  'Date arrivée',
  'Heure arrivée',
  'Motif',
  'Chauffeur',
  'Matricule chauffeur',
  'Chauffeur type',
  'Mode véhicule',
  'Véhicule',
  'Food allowance',
  'Food for the road',
  'Toll gate',
  'Total budget',
  'Notes',
] as const;

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: '0F2744' } },
};

const LABEL_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: '0F2744' } },
};

const MONEY_COLS = new Set([19, 20, 21, 22]);

function statusLabel(status: CharroiVoyage['status']): string {
  return CHARROI_VOYAGE_STATUSES.find((item) => item.id === status)?.label ?? status;
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function vehicleModeLabel(mode: CharroiVoyage['vehiculeMode']): string {
  if (mode === 'flotte') return 'Flotte';
  if (mode === 'location') return 'Location';
  return '';
}

function personType(interne: boolean, nom: string): string {
  if (!nom.trim()) return '';
  return interne ? 'Interne' : 'Externe';
}

function sheetNameSafe(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
}

function applyHeaderStyle(ws: XLSX.WorkSheet, row: number, colCount: number) {
  for (let col = 0; col < colCount; col += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
    if (cell) cell.s = HEADER_STYLE;
  }
}

function voyageRow(item: CharroiVoyage): (string | number)[] {
  return [
    item.numero || '',
    statusLabel(item.status),
    item.passagerNom || '',
    item.passagerMatricule || '',
    personType(item.passagerInterne, item.passagerNom),
    item.nombrePersonnes || 1,
    item.depart || '',
    item.destination || '',
    `${item.depart || ''} → ${item.destination || ''}`.trim(),
    formatDate(item.dateDepart),
    item.heureDepart || '',
    formatDate(item.dateArrivee),
    item.heureArrivee || '',
    item.motif || '',
    item.chauffeurNom || '',
    item.chauffeurMatricule || '',
    personType(item.chauffeurInterne, item.chauffeurNom),
    vehicleModeLabel(item.vehiculeMode),
    item.vehiculeLibelle || '',
    item.foodAllowance || 0,
    item.foodForTheRoad || 0,
    item.tollGate || 0,
    voyageBudgetTotal(item),
    item.notes || '',
  ];
}

function buildVoyagesSheet(items: CharroiVoyage[], title: string): XLSX.WorkSheet {
  const rows = items.map(voyageRow);
  const ws = XLSX.utils.aoa_to_sheet([
    [title],
    [`Export du ${new Date().toLocaleDateString('fr-FR')} — ${items.length} voyage(s)`],
    [...HEADERS],
    ...rows,
  ]);
  const titleCell = ws.A1;
  if (titleCell) titleCell.s = TITLE_STYLE;
  applyHeaderStyle(ws, 2, HEADERS.length);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2 + rows.length, c: HEADERS.length - 1 } }),
  };
  ws['!cols'] = [
    10, 12, 22, 12, 12, 10, 16, 16, 28, 12, 10, 12, 10, 22, 20, 14, 14, 12, 28, 14, 16, 12, 14, 28,
  ].map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 22 }];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 3; r <= range.e.r; r += 1) {
    for (const c of MONEY_COLS) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
    }
  }
  return ws;
}

function countBy(items: CharroiVoyage[], keyOf: (item: CharroiVoyage) => string): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = keyOf(item).trim() || '—';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

function buildSyntheseSheet(items: CharroiVoyage[], title: string): XLSX.WorkSheet {
  const budget = items.reduce((sum, item) => sum + voyageBudgetTotal(item), 0);
  const people = items.reduce((sum, item) => sum + (item.nombrePersonnes || 1), 0);
  const byStatus = CHARROI_VOYAGE_STATUSES.map((status) => ({
    label: status.label,
    count: items.filter((item) => item.status === status.id).length,
  }));
  const destinations = countBy(items, (item) => item.destination);
  const trajets = countBy(items, (item) => `${item.depart} → ${item.destination}`);
  const chauffeurs = countBy(
    items.filter((item) => item.chauffeurNom.trim()),
    (item) => item.chauffeurNom,
  ).slice(0, 15);
  const vehicules = countBy(
    items.filter((item) => item.vehiculeLibelle.trim()),
    (item) => item.vehiculeLibelle,
  ).slice(0, 15);

  const aoa: (string | number)[][] = [
    [title],
    [`Export du ${new Date().toLocaleDateString('fr-FR')}`],
    [],
    ['Indicateur', 'Valeur'],
    ['Voyages', items.length],
    ['Personnes', people],
    ['Budget total', budget],
    [],
    ['Statut', 'Nombre'],
    ...byStatus.map((item) => [item.label, item.count]),
    [],
    ['Destination', 'Nombre'],
    ...destinations.map((item) => [item.label, item.count]),
    [],
    ['Trajet', 'Nombre'],
    ...trajets.map((item) => [item.label, item.count]),
    [],
    ['Chauffeur', 'Courses'],
    ...chauffeurs.map((item) => [item.label, item.count]),
    [],
    ['Véhicule', 'Courses'],
    ...vehicules.map((item) => [item.label, item.count]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (ws.A1) ws.A1.s = TITLE_STYLE;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const sectionLabels = new Set(['Indicateur', 'Statut', 'Destination', 'Trajet', 'Chauffeur', 'Véhicule']);
  for (let r = 0; r <= range.e.r; r += 1) {
    const labelCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const valueCell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const value = String(labelCell?.v ?? '');
    if (sectionLabels.has(value)) {
      applyHeaderStyle(ws, r, 2);
    } else if (labelCell && r >= 3) {
      labelCell.s = LABEL_STYLE;
    }
    if (value === 'Budget total' && valueCell && typeof valueCell.v === 'number') {
      valueCell.z = '#,##0.00';
    }
  }
  ws['!cols'] = [{ wch: 36 }, { wch: 14 }];
  return ws;
}

export function downloadCharroiVoyagesExport(
  items: CharroiVoyage[],
  options?: { filename?: string; title?: string },
): void {
  const title = options?.title || 'Voyage par route';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildVoyagesSheet(items, title), sheetNameSafe('Voyages'));
  XLSX.utils.book_append_sheet(wb, buildSyntheseSheet(items, `${title} — Synthèse`), sheetNameSafe('Synthèse'));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, options?.filename || `voyage-par-route-${stamp}.xlsx`);
}

export function charroiVoyagePeriodLabel(year: number, month: number): string {
  const label = MONTHS[month - 1];
  return label ? `${label} ${year}` : String(year);
}
