import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import fsSync from 'fs';
import { writeDocxFromTemplate } from './docx-template';
import { buildResidenceAttestationPdfBuffer } from './residence-attestation-pdf.server';
import { buildResidenceAttestationPreviewHtmlForForm } from './residence-attestation-preview.server';
import {
  fillResidenceAttestationXml,
  formatResidenceAttestationFileName,
  RESIDENCE_ATTESTATION_TEMPLATE_PATH,
} from './residence-attestation-template';
import type {
  ResidenceAttestationFormData,
  ResidenceAttestationHistoryData,
  ResidenceAttestationRecord,
} from './residence-attestation-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

const DATA_DIR = canPersistProjectFiles()
  ? path.join(process.cwd(), 'data', 'residence-attestation')
  : path.join(getWritableDataRoot(), 'residence-attestation');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

function seedIfNeeded(): void {
  if (canPersistProjectFiles()) return;
  const bundled = path.join(process.cwd(), 'data', 'residence-attestation', 'history.json');
  try {
    if (!fsSync.existsSync(HISTORY_PATH) && fsSync.existsSync(bundled)) {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
      fsSync.copyFileSync(bundled, HISTORY_PATH);
    }
  } catch {
    // ignore
  }
}
seedIfNeeded();

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true });
}

async function readHistory(): Promise<ResidenceAttestationHistoryData> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    const json = JSON.parse(raw) as ResidenceAttestationHistoryData;
    return { records: json.records ?? [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { records: [] };
    throw err;
  }
}

async function writeHistory(data: ResidenceAttestationHistoryData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function listResidenceAttestations(): Promise<ResidenceAttestationRecord[]> {
  const data = await readHistory();
  return [...data.records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getResidenceAttestation(id: string): Promise<ResidenceAttestationRecord | undefined> {
  const data = await readHistory();
  return data.records.find((item) => item.id === id);
}

export async function deleteResidenceAttestation(id: string): Promise<boolean> {
  const data = await readHistory();
  const index = data.records.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const [removed] = data.records.splice(index, 1);
  await writeHistory(data);
  await Promise.all([
    fs.rm(removed.docxPath, { force: true }).catch(() => undefined),
    removed.pdfPath ? fs.rm(removed.pdfPath, { force: true }).catch(() => undefined) : Promise.resolve(),
  ]);
  return true;
}

export async function createResidenceAttestation(
  form: ResidenceAttestationFormData,
): Promise<ResidenceAttestationRecord> {
  await ensureDataDir();

  const id = randomUUID();
  const fileName = formatResidenceAttestationFileName(form.employeeName, form.documentDate);
  const docxPath = path.join(FILES_DIR, `${id}.docx`);
  const pdfPath = path.join(FILES_DIR, `${id}.pdf`);

  await writeDocxFromTemplate(RESIDENCE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
    fillResidenceAttestationXml(xml, form),
  );
  const previewHtml = await buildResidenceAttestationPreviewHtmlForForm(form);

  let savedPdfPath: string | undefined;
  try {
    const pdfBuffer = await buildResidenceAttestationPdfBuffer(form);
    await fs.writeFile(pdfPath, pdfBuffer);
    savedPdfPath = pdfPath;
  } catch {
    savedPdfPath = undefined;
  }

  const record: ResidenceAttestationRecord = {
    ...form,
    id,
    createdAt: new Date().toISOString(),
    fileName,
    docxPath,
    pdfPath: savedPdfPath,
    previewHtml,
  };

  const data = await readHistory();
  data.records.unshift(record);
  await writeHistory(data);
  return record;
}
