import 'server-only';

import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { PDFDocument } from 'pdf-lib';
import { promisify } from 'util';
import * as XLSX from 'xlsx';
import { isWindows } from './windows-shell';
import type { TravelGeneratedFile } from './travel-types';

const execFileAsync = promisify(execFile);
const BATCH_CONVERT_SCRIPT = path.join(process.cwd(), 'scripts', 'convert-travel-bundle-to-pdf.ps1');

const SOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/lib/libreoffice/program/soffice',
].filter((item): item is string => Boolean(item?.trim()));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((item): item is string => Boolean(item?.trim()));

interface ConversionJob {
  input: string;
  output: string;
  ext: string;
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

async function convertWithWindowsOffice(jobs: ConversionJob[]): Promise<void> {
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
}

async function convertWithLibreOffice(soffice: string, jobs: ConversionJob[]): Promise<void> {
  const outDir = path.dirname(jobs[0].output);
  await execFileAsync(
    soffice,
    [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--norestore',
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      ...jobs.map((job) => job.input),
    ],
    { maxBuffer: 20 * 1024 * 1024, timeout: 180_000 },
  );

  await Promise.all(
    jobs.map(async (job) => {
      const produced = path.join(outDir, `${path.parse(job.input).name}.pdf`);
      if (path.resolve(produced) !== path.resolve(job.output)) {
        await fs.copyFile(produced, job.output);
      }
    }),
  );
}

function spreadsheetToHtml(inputPath: string): string {
  const workbook = XLSX.readFile(inputPath, { cellStyles: true });
  const sections = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const table = sheet ? XLSX.utils.sheet_to_html(sheet) : '';
    return `<section><h1>${escapeHtml(name)}</h1>${table}</section>`;
  });
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Document</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font: 11px/1.35 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 14px; margin: 0 0 8px; }
    section { page-break-after: always; }
    section:last-child { page-break-after: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #c5c5c5; padding: 3px 5px; vertical-align: top; }
  </style>
</head>
<body>${sections.join('')}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function officeFileToHtml(job: ConversionJob, htmlPath: string): Promise<void> {
  if (job.ext === '.xlsx' || job.ext === '.xls') {
    await fs.writeFile(htmlPath, spreadsheetToHtml(job.input), 'utf8');
    return;
  }
  if (process.platform === 'darwin' && (job.ext === '.docx' || job.ext === '.doc' || job.ext === '.rtf')) {
    await execFileAsync('textutil', ['-convert', 'html', job.input, '-output', htmlPath], {
      timeout: 30_000,
    });
    return;
  }
  throw new Error(`Conversion HTML impossible pour ${path.basename(job.input)}`);
}

async function printHtmlWithChrome(chrome: string, htmlPath: string, outputPath: string): Promise<void> {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-chrome-'));
  try {
    await execFileAsync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pdf-header-footer',
        `--user-data-dir=${profileDir}`,
        `--print-to-pdf=${outputPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
    );
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
}

async function convertWithHtmlChrome(chrome: string, jobs: ConversionJob[]): Promise<void> {
  const htmlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-html-'));
  try {
    for (const [index, job] of jobs.entries()) {
      const htmlPath = path.join(htmlDir, `doc-${index}.html`);
      await officeFileToHtml(job, htmlPath);
      await printHtmlWithChrome(chrome, htmlPath, job.output);
    }
  } finally {
    await fs.rm(htmlDir, { recursive: true, force: true });
  }
}

async function convertOfficeFilesBatch(jobs: ConversionJob[]): Promise<void> {
  if (!jobs.length) return;

  if (isWindows()) {
    await convertWithWindowsOffice(jobs);
  } else {
    const soffice = await firstExistingPath(SOFFICE_CANDIDATES);
    if (soffice) {
      await convertWithLibreOffice(soffice, jobs);
    } else {
      const chrome = await firstExistingPath(CHROME_CANDIDATES);
      if (!chrome) {
        throw new Error(
          'Le PDF combiné nécessite LibreOffice ou Google Chrome sur ce Mac. Installez l’un des deux puis réessayez.',
        );
      }
      await convertWithHtmlChrome(chrome, jobs);
    }
  }

  await Promise.all(jobs.map((job) => fs.access(job.output)));
}

/**
 * Convertit un buffer Office (.xlsx / .docx) en PDF.
 */
export async function convertOfficeBufferToPdf(
  inputBuffer: Buffer,
  ext: '.xlsx' | '.docx' | '.doc',
): Promise<Buffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'office-pdf-'));
  const inputPath = path.join(tempDir, `input${ext}`);
  const outputPath = path.join(tempDir, 'output.pdf');
  try {
    await fs.writeFile(inputPath, inputBuffer);
    await convertOfficeFilesBatch([
      {
        input: inputPath,
        output: outputPath,
        ext,
      },
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
