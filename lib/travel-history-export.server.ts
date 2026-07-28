import 'server-only';

import { buildExportDateStamp } from './employee-filters';
import { buildTravelHistoryWorkbookBuffer } from './travel-history-export-xlsx.server';

export function buildTravelHistoryExportFilename(): string {
  return `HISTORIQUE_MISSION_${buildExportDateStamp()}.xlsx`;
}

export async function buildTravelHistoryExportBuffer(): Promise<Buffer> {
  return buildTravelHistoryWorkbookBuffer();
}
