import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_HRCO_EXCO_MEMBERS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

type MembersFile = { matricules: string[] };

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
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

/** Liste vide = les grades E du registre, tant que personne n’a enregistré de liste. */
export async function readHrcoExcoMembers(): Promise<string[] | null> {
  const filePath = resolveStorePath(DURABLE_HRCO_EXCO_MEMBERS_KEY);
  await hydrateDurableFile(DURABLE_HRCO_EXCO_MEMBERS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as MembersFile;
    return Array.isArray(json.matricules) ? json.matricules.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeHrcoExcoMembers(matricules: string[]): Promise<string[]> {
  const unique = [...new Set(matricules.map((item) => item.trim()).filter(Boolean))];
  const filePath = resolveStorePath(DURABLE_HRCO_EXCO_MEMBERS_KEY);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify({ matricules: unique }, null, 2), 'utf8');
  await persistDurableFile(DURABLE_HRCO_EXCO_MEMBERS_KEY, filePath);
  return unique;
}
