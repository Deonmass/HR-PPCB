import { readFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'employees', 'capital-hr-poste-caphr.json');

type CapHrPosteFile = {
  byEmployeeId?: Record<string, string>;
};

let cache: Map<string, string> | null = null;

async function loadMap(): Promise<Map<string, string>> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CapHrPosteFile;
    cache = new Map(
      Object.entries(parsed.byEmployeeId || {}).map(([id, poste]) => [id, String(poste || '').trim()]),
    );
  } catch {
    cache = new Map();
  }
  return cache;
}

/** Poste tel qu’écrit dans les fichiers paie Capital HR (Usine + Hors-site). */
export async function lookupCapitalHrPosteCapHr(employeeId: string): Promise<string> {
  const map = await loadMap();
  return map.get(employeeId) || '';
}

export async function loadCapitalHrPosteCapHrMap(): Promise<Map<string, string>> {
  return loadMap();
}
