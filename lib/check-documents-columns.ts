import { DOCUMENT_FIELDS } from './documents';

export const CHECK_DOCUMENTS_SHEET = 'CHECK DOCUMENTS BASE';
/** Feuille export — agents sortis (EXIT). */
export const CHECK_DOCUMENTS_EXIT_SHEET = 'CHECK DOCUMENTS EXIT';
/** Première ligne de données (0-based) — ligne Excel 4. */
export const CHECK_DOCUMENTS_DATA_START = 3;

/**
 * Sur le fichier live (sans date d’embauche) :
 * docs = colonnes G–Y (index 6–24), puis Z–AC = Y/NA/N/RATE.
 * L’export template (avec date d’embauche en F) décale docs en H–Z
 * et les totaux en AA–AD — géré dans check-documents-export-xlsx.server.ts.
 */
export const CHECK_DOCUMENTS_DOC_COL_START = 6;
export const CHECK_DOCUMENTS_DOC_COL_END = CHECK_DOCUMENTS_DOC_COL_START + DOCUMENT_FIELDS.length - 1;
export const CHECK_DOCUMENTS_LAST_COL = CHECK_DOCUMENTS_DOC_COL_END + 4;
