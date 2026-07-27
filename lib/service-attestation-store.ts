import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeDocxFromTemplate } from './docx-template';
import { convertDocxToPdf } from './travel-pdf';
import {
  buildServiceAttestationPreviewHtml,
  extractDocxPlainText,
  fillServiceAttestationXml,
  formatServiceAttestationFileName,
  SERVICE_ATTESTATION_TEMPLATE_PATH,
} from './service-attestation-template';
import type {
  ServiceAttestationFormData,
  ServiceAttestationHistoryData,
  ServiceAttestationRecord,
} from './service-attestation-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import fsSync from 'fs';

const DATA_DIR = canPersistProjectFiles()
  ? path.join(process.cwd(), 'data', 'service-attestation')
  : path.join(getWritableDataRoot(), 'service-attestation');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

function seedServiceAttestationIfNeeded(): void {
  if (canPersistProjectFiles()) return;
  const bundled = path.join(process.cwd(), 'data', 'service-attestation', 'history.json');
  try {
    if (!fsSync.existsSync(HISTORY_PATH) && fsSync.existsSync(bundled)) {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
      fsSync.copyFileSync(bundled, HISTORY_PATH);
    }
  } catch {
    // ignore
  }
}
seedServiceAttestationIfNeeded();

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true });
}

async function readHistory(): Promise<ServiceAttestationHistoryData> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    const json = JSON.parse(raw) as ServiceAttestationHistoryData;
    return { records: json.records ?? [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { records: [] };
    throw err;
  }
}

async function writeHistory(data: ServiceAttestationHistoryData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function listServiceAttestations(): Promise<ServiceAttestationRecord[]> {
  const data = await readHistory();
  return [...data.records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getServiceAttestation(id: string): Promise<ServiceAttestationRecord | undefined> {
  const data = await readHistory();
  return data.records.find((item) => item.id === id);
}

export async function deleteServiceAttestation(id: string): Promise<boolean> {
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

export async function createServiceAttestation(
  form: ServiceAttestationFormData,
): Promise<ServiceAttestationRecord> {
  await ensureDataDir();

  const id = randomUUID();
  const fileName = formatServiceAttestationFileName(
    form.employeeName,
    form.documentDate,
    form.language,
  );
  const docxPath = path.join(FILES_DIR, `${id}.docx`);
  const pdfPath = path.join(FILES_DIR, `${id}.pdf`);

  let previewHtml = '';

  await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) => {
    const filled = fillServiceAttestationXml(xml, form);
    previewHtml = buildServiceAttestationPreviewHtml(extractDocxPlainText(filled));
    return filled;
  });

  let savedPdfPath: string | undefined;
  try {
    await convertDocxToPdf(docxPath, pdfPath);
    savedPdfPath = pdfPath;
  } catch {
    savedPdfPath = undefined;
  }

  const record: ServiceAttestationRecord = {
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
