import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_PROTOCOL_VOYAGES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import {
  computeCoutHotel,
  computeCoutTotal,
  roundMoney,
  type ProtocolVoyageCout,
  type ProtocolVoyageCoutInput,
  type ProtocolVoyagesStore,
} from './protocol-voyage-types';

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

function storePath(): string {
  return resolveStorePath(path.join('data', 'protocol', 'voyages-couts.json'));
}

function nowIso(): string {
  return new Date().toISOString();
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function money(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

function nights(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(365, Math.round(n));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function idFromSeq(seq: number): string {
  return `pvc-${String(seq).padStart(3, '0')}`;
}

function numeroFromSeq(seq: number): string {
  return `PVC-${String(seq).padStart(4, '0')}`;
}

function parseSeq(id: string): number | null {
  const match = id.trim().match(/^pvc-(\d+)$/);
  if (!match) return null;
  const seq = Number.parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

function normalize(input: ProtocolVoyageCoutInput, seq: number, timestamps?: { createdAt?: string; updatedAt?: string }): ProtocolVoyageCout {
  const voyageur = str(input.voyageur);
  const destination = str(input.destination);
  const date = str(input.date);
  if (!voyageur) throw new Error('Voyageur requis');
  if (!destination) throw new Error('Destination requise');
  if (!isIsoDate(date)) throw new Error('Date invalide');
  const hotelNuit = money(input.hotelNuit);
  const nbreNuits = nights(input.nbreNuits);
  const coutHotel = computeCoutHotel(hotelNuit, nbreNuits);
  const ticketAvion = money(input.ticketAvion);
  const visaVolant = money(input.visaVolant);
  const lettreLegaliser = money(input.lettreLegaliser);
  const goPass = money(input.goPass);
  const transfert = money(input.transfert);
  const appartement = money(input.appartement);
  const now = nowIso();
  return {
    id: str(input.id) || idFromSeq(seq),
    numero: str(input.numero) || numeroFromSeq(seq),
    date,
    voyageur,
    voyageurMatricule: str(input.voyageurMatricule),
    destination,
    ticketAvion,
    visaVolant,
    lettreLegaliser,
    goPass,
    transfert,
    hotelNuit,
    nbreNuits,
    coutHotel,
    categorieHotel: str(input.categorieHotel),
    appartement,
    coutTotal: computeCoutTotal({
      ticketAvion,
      visaVolant,
      lettreLegaliser,
      goPass,
      transfert,
      coutHotel,
      appartement,
    }),
    createdAt: timestamps?.createdAt || str(input.createdAt) || now,
    updatedAt: timestamps?.updatedAt || now,
  };
}

async function readStore(): Promise<ProtocolVoyagesStore> {
  const filePath = storePath();
  await hydrateDurableFile(DURABLE_PROTOCOL_VOYAGES_KEY, filePath);
  let raw: ProtocolVoyagesStore = { voyages: [], nextSeq: 1 };
  try {
    raw = JSON.parse(await fsPromises.readFile(filePath, 'utf8')) as ProtocolVoyagesStore;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') throw err;
  }
  const voyages = Array.isArray(raw.voyages)
    ? raw.voyages.map((item, index) => normalize(item, index + 1, {
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
    : [];
  const maxSeq = voyages.reduce((max, item) => Math.max(max, parseSeq(item.id) ?? 0), 0);
  return {
    voyages,
    nextSeq: Math.max(Number(raw.nextSeq) || 1, maxSeq + 1),
  };
}

async function writeStore(store: ProtocolVoyagesStore): Promise<void> {
  const filePath = storePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
  await persistDurableFile(DURABLE_PROTOCOL_VOYAGES_KEY, filePath);
}

export async function listProtocolVoyages(): Promise<ProtocolVoyageCout[]> {
  const store = await readStore();
  return [...store.voyages].sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
}

export async function getProtocolVoyage(id: string): Promise<ProtocolVoyageCout | null> {
  const store = await readStore();
  return store.voyages.find((item) => item.id === id) ?? null;
}

export async function createProtocolVoyage(input: ProtocolVoyageCoutInput): Promise<ProtocolVoyageCout> {
  const store = await readStore();
  const seq = store.nextSeq;
  const item = normalize({ ...input, id: idFromSeq(seq), numero: numeroFromSeq(seq) }, seq);
  store.voyages.push(item);
  store.nextSeq = seq + 1;
  await writeStore(store);
  return item;
}

export async function updateProtocolVoyage(id: string, input: ProtocolVoyageCoutInput): Promise<ProtocolVoyageCout> {
  const store = await readStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  const updated = normalize(
    { ...prev, ...input, id: prev.id, numero: prev.numero },
    parseSeq(prev.id) ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.voyages[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteProtocolVoyage(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.voyages.filter((item) => item.id !== id);
  if (next.length === store.voyages.length) return false;
  store.voyages = next;
  await writeStore(store);
  return true;
}
