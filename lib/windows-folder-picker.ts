import 'server-only';

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { isWindows } from './windows-shell';

const execFileAsync = promisify(execFile);
const PICK_FOLDER_SCRIPT = path.join(process.cwd(), 'scripts', 'pick-folder.ps1');

export async function pickWindowsFolder(initialPath?: string): Promise<string | null> {
  if (!isWindows()) {
    throw new Error('Le sélecteur de dossier natif est disponible uniquement sous Windows');
  }

  const args = [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    PICK_FOLDER_SCRIPT,
  ];

  if (initialPath?.trim()) {
    args.push('-InitialPath', path.resolve(initialPath.trim()));
  }

  try {
    const { stdout } = await execFileAsync('powershell.exe', args, {
      windowsHide: false,
      maxBuffer: 4 * 1024 * 1024,
    });

    const selected = stdout
      .trim()
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();

    return selected || null;
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code === 2 || code === '2') return null;
    throw err;
  }
}
