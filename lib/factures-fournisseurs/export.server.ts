import 'server-only';

import { buildFacturesSuiviWorkbookBuffer } from '@/lib/factures-fournisseurs/export-xlsx.server';
import { listFacturesSuivi } from '@/lib/factures-fournisseurs/store';

export function buildFacturesSuiviExportFilename(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `FACTURES_SUIVI_${stamp}.xlsx`;
}

export async function buildFacturesSuiviExportBuffer(): Promise<Buffer> {
  const factures = await listFacturesSuivi();
  return buildFacturesSuiviWorkbookBuffer(factures);
}
