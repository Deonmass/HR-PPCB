import { spawn } from 'child_process';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { assertAllowedPath } from './safe-path';

const execFileAsync = promisify(execFile);

export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Opens Windows Explorer and selects the given file.
 * No-op on non-Windows platforms.
 */
export async function openFileLocation(filePath: string): Promise<void> {
  if (!isWindows()) return;

  const resolved = assertAllowedPath(filePath);
  await fs.access(resolved);

  await execFileAsync('explorer.exe', [`/select,${resolved}`], {
    windowsHide: false,
  });
}

/**
 * Opens Windows Explorer at the given folder.
 */
export async function openFolder(folderPath: string): Promise<void> {
  if (!isWindows()) return;

  const resolved = assertAllowedPath(folderPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Le chemin indiqué n\'est pas un dossier');
  }

  await new Promise<void>((resolve) => {
    const child = spawn('explorer.exe', [resolved], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => resolve());
    child.unref();
    setTimeout(resolve, 250);
  });
}

/**
 * Opens the Excel file with the default application (Excel).
 */
const OPENABLE_EXTENSIONS = new Set(['.xlsx', '.xls', '.docx', '.doc', '.pdf']);

export async function openExcelFile(filePath: string): Promise<void> {
  const resolved = assertAllowedPath(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (!OPENABLE_EXTENSIONS.has(extension)) {
    throw new Error('Type de fichier non autorisé');
  }
  await fs.access(resolved);

  if (!isWindows()) {
    throw new Error('Ouverture Excel disponible uniquement sous Windows');
  }

  await execFileAsync('explorer.exe', [`/select,${resolved}`], {
    windowsHide: false,
  });
}

export async function assertExistingFile(filePath: string): Promise<string> {
  const resolved = assertAllowedPath(filePath);
  await fs.access(resolved);
  return resolved;
}

export async function assertExistingDirectory(directoryPath: string): Promise<string> {
  const resolved = assertAllowedPath(directoryPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Le chemin indiqué n\'est pas un dossier');
  }
  return resolved;
}
