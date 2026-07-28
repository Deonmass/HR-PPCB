import 'server-only';

import { buildProjectsWorkbookBuffer } from './projects-export-xlsx.server';
import { readProjects } from './projects-store';

export function buildProjectsExportFilename(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `PROJECTS_${stamp}.xlsx`;
}

export async function buildProjectsExportBuffer(): Promise<Buffer> {
  const data = await readProjects();
  return buildProjectsWorkbookBuffer(data.projects, data.expenses);
}
