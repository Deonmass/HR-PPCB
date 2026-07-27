import 'server-only';

import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { promisify } from 'util';
import { isWindows } from './windows-shell';
import type { TravelGeneratedFile } from './travel-types';

const execFileAsync = promisify(execFile);
const BATCH_CONVERT_SCRIPT = path.join(process.cwd(), 'scripts', 'convert-travel-bundle-to-pdf.ps1');

interface ConversionJob {
  input: string;
  output: string;
  ext: string;
}

async function convertOfficeFilesBatch(jobs: ConversionJob[]): Promise<void> {
  if (!jobs.length) return;
  if (!isWindows()) {
    throw new Error('La conversion PDF est disponible uniquement sous Windows avec Microsoft Office');
  }

  const tempDir = path.dirname(jobs[0].output);
  const jobsPath = path.join(tempDir, 'pdf-jobs.json');
  await fs.writeFile(jobsPath, JSON.stringify(jobs), 'utf8');

  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      BATCH_CONVERT_SCRIPT,
      '-JobsPath',
      jobsPath,
    ],
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
  );

  await Promise.all(jobs.map((job) => fs.access(job.output)));
}

async function mergePdfFiles(inputPaths: string[], outputPath: string): Promise<void> {
  const merged = await PDFDocument.create();

  for (const inputPath of inputPaths) {
    const bytes = await fs.readFile(inputPath);
    const document = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(document, document.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await merged.save());
}

export async function convertDocxToPdf(inputPath: string, outputPath: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-pdf-'));
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  const tempOutput = path.join(tempDir, 'output.pdf');

  try {
    await convertOfficeFilesBatch([
      {
        input: resolvedInput,
        output: tempOutput,
        ext: path.extname(resolvedInput).toLowerCase(),
      },
    ]);
    await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
    await fs.copyFile(tempOutput, resolvedOutput);
    return resolvedOutput;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function buildTravelPdfBundle(
  files: TravelGeneratedFile[],
  outputPath: string,
): Promise<string> {
  if (!files.length) {
    throw new Error('Aucun document à convertir en PDF');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-pdf-'));
  const jobs: ConversionJob[] = files.map((file) => ({
    input: path.resolve(file.filePath),
    output: path.join(tempDir, `${file.type}.pdf`),
    ext: path.extname(file.filePath).toLowerCase(),
  }));

  try {
    await convertOfficeFilesBatch(jobs);
    const resolvedOutput = path.resolve(outputPath);
    await mergePdfFiles(
      jobs.map((job) => job.output),
      resolvedOutput,
    );
    return resolvedOutput;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
