import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_VILLAGE_ELIGIBILITE_KEY,
  hydrateDurableFile,
  persistDurableFile,
  rememberDurableMergeBase,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import {
  emptyVillageEligibiliteData,
  mergeEligibiliteEntries,
  normalizeVillageEligibiliteData,
  type VillageEligibiliteData,
} from './village-eligibilite';

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

function eligibilitePath(): string {
  return resolveStorePath(path.join('data', 'village', 'eligibilite.json'));
}

export async function readVillageEligibilite(): Promise<VillageEligibiliteData> {
  const filePath = eligibilitePath();
  await hydrateDurableFile(DURABLE_VILLAGE_ELIGIBILITE_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return normalizeVillageEligibiliteData(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyVillageEligibiliteData();
    throw err;
  }
}

export async function saveVillageEligibilite(payload: unknown): Promise<VillageEligibiliteData> {
  const current = await readVillageEligibilite();
  const saved = mergeEligibiliteEntries(current, payload);
  const filePath = eligibilitePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await hydrateDurableFile(DURABLE_VILLAGE_ELIGIBILITE_KEY, filePath);
  try {
    const previous = await fsPromises.readFile(filePath);
    rememberDurableMergeBase(DURABLE_VILLAGE_ELIGIBILITE_KEY, previous);
  } catch {
    // nouveau fichier
  }
  await fsPromises.writeFile(filePath, JSON.stringify(saved, null, 2), 'utf8');
  try {
    await persistDurableFile(DURABLE_VILLAGE_ELIGIBILITE_KEY, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Impossible d’enregistrer l’éligibilité en ligne : ${message}`);
  }
  return saved;
}
