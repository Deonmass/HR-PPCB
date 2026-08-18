import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_VILLAGE_PRESENTATION_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { Employee } from './types';
import {
  normalizeVillagePresentation,
  type VillagePresentation,
} from './village-presentation';

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), relativePath);
  }
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function presentationPath(): string {
  return resolveStorePath(path.join('data', 'village', 'presentation.json'));
}

export async function readVillagePresentation(
  employees: Employee[] = [],
): Promise<VillagePresentation> {
  const filePath = presentationPath();
  await hydrateDurableFile(DURABLE_VILLAGE_PRESENTATION_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return normalizeVillagePresentation(JSON.parse(raw), employees);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return normalizeVillagePresentation(null, employees);
    throw err;
  }
}

export async function saveVillagePresentation(
  payload: unknown,
  employees: Employee[] = [],
): Promise<VillagePresentation> {
  const saved = normalizeVillagePresentation(payload, employees);
  saved.updatedAt = new Date().toISOString();
  const filePath = presentationPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(saved, null, 2), 'utf8');
  await persistDurableFile(DURABLE_VILLAGE_PRESENTATION_KEY, filePath);
  return saved;
}
