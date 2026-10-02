import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import fsSync from 'fs';
import { writeDocxFromTemplate } from './docx-template';
import { formatAttestationAgentName } from './format-display-name';
import { splitBilingualLeaveForm } from './leave-attestation-agent';
import { buildLeaveAttestationPdfBuffer } from './leave-attestation-pdf.server';
import { buildLeaveAttestationPreviewHtmlForForm } from './leave-attestation-preview.server';
import {
  fillBilingualLeaveAttestationXml,
  fillLeaveAttestationXml,
  formatLeaveAttestationFileName,
  LEAVE_ATTESTATION_TEMPLATE_PATH,
} from './leave-attestation-template';
import type {
  LeaveAttestationFormData,
  LeaveAttestationHistoryData,
  LeaveAttestationRecord,
} from './leave-attestation-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

const DATA_DIR = canPersistProjectFiles()
  ? path.join(process.cwd(), 'data', 'leave-attestation')
  : path.join(getWritableDataRoot(), 'leave-attestation');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const FILES_DIR = path.join(DATA_DIR, 'files');

function seedIfNeeded(): void {
  if (canPersistProjectFiles()) return;
  const bundled = path.join(process.cwd(), 'data', 'leave-attestation', 'history.json');
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

async function readHistory(): Promise<LeaveAttestationHistoryData> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    const json = JSON.parse(raw) as LeaveAttestationHistoryData;
    return { records: json.records ?? [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { records: [] };
    throw err;
  }
}

async function writeHistory(data: LeaveAttestationHistoryData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function listLeaveAttestations(): Promise<LeaveAttestationRecord[]> {
  const data = await readHistory();
  return [...data.records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getLeaveAttestation(id: string): Promise<LeaveAttestationRecord | undefined> {
  const data = await readHistory();
  return data.records.find((item) => item.id === id);
}

export async function deleteLeaveAttestation(id: string): Promise<boolean> {
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

export async function createLeaveAttestation(
  form: LeaveAttestationFormData,
): Promise<LeaveAttestationRecord> {
  await ensureDataDir();

  const language =
    form.language === 'both' ? 'both' : form.language === 'en' ? 'en' : 'fr';
  const normalized: LeaveAttestationFormData = {
    ...form,
    language,
    hodName: formatAttestationAgentName(form.hodName),
    employeeName: formatAttestationAgentName(form.employeeName),
    bodyText: form.bodyText?.trim() || undefined,
    bodyTextEn: form.bodyTextEn?.trim() || undefined,
    hodFunctionEn: form.hodFunctionEn?.trim() || undefined,
    employeeGenreEn: form.employeeGenreEn?.trim() || undefined,
    employeeFunctionEn: form.employeeFunctionEn?.trim() || undefined,
  };

  const id = randomUUID();
  const fileName = formatLeaveAttestationFileName(
    normalized.employeeName,
    normalized.documentDate,
    language,
  );
  const docxPath = path.join(FILES_DIR, `${id}.docx`);
  const pdfPath = path.join(FILES_DIR, `${id}.pdf`);

  if (language === 'both') {
    const { fr, en } = splitBilingualLeaveForm(normalized);
    await writeDocxFromTemplate(LEAVE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
      fillBilingualLeaveAttestationXml(xml, fr, en),
    );
  } else {
    await writeDocxFromTemplate(LEAVE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
      fillLeaveAttestationXml(xml, normalized),
    );
  }
  const previewHtml = await buildLeaveAttestationPreviewHtmlForForm(normalized);

  let savedPdfPath: string | undefined;
  try {
    const pdfBuffer = await buildLeaveAttestationPdfBuffer(normalized);
    await fs.writeFile(pdfPath, pdfBuffer);
    savedPdfPath = pdfPath;
  } catch {
    savedPdfPath = undefined;
  }

  const record: LeaveAttestationRecord = {
    ...normalized,
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
