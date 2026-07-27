import type { TravelGeneratedFile } from './travel-types';

export interface SaveDirectorySelection {
  label: string;
  serverPath?: string;
  directoryHandle?: FileSystemDirectoryHandle;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function isFullWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\\/.test(value.trim());
}

function getDirectoryPathFromNativeFile(file: File): string | null {
  const fileWithPath = file as File & { path?: string };
  const nativePath = fileWithPath.path?.trim();
  if (!nativePath) return null;

  const normalized = nativePath.replace(/\//g, '\\');
  const lastSeparator = normalized.lastIndexOf('\\');
  if (lastSeparator <= 0) return null;

  const directory = normalized.slice(0, lastSeparator);
  return isFullWindowsPath(directory) ? directory : null;
}

export function selectionFromFileList(files: FileList | null): SaveDirectorySelection | null {
  if (!files?.length) return null;

  const serverPath = getDirectoryPathFromNativeFile(files[0]);
  if (serverPath) {
    return { label: serverPath, serverPath };
  }

  const relativePath = files[0].webkitRelativePath?.trim();
  if (!relativePath) return null;

  const folderName = relativePath.split(/[/\\]/)[0]?.trim();
  if (!folderName) return null;

  return { label: folderName };
}

export function isValidSaveDirectorySelection(label: string): boolean {
  return isFullWindowsPath(label);
}

export function hasWritableDirectoryHandle(
  handle: FileSystemDirectoryHandle | null,
): handle is FileSystemDirectoryHandle {
  return handle !== null;
}

export async function requestSaveDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    return null;
  }

  const showDirectoryPicker = (
    window as Window & {
      showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  try {
    const handle = await showDirectoryPicker({ mode: 'readwrite' });
    const permissionHandle = handle as FileSystemDirectoryHandle & {
      requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
    };
    if (permissionHandle.requestPermission) {
      const permission = await permissionHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        throw new Error('Autorisation refusée pour enregistrer dans ce dossier');
      }
    }
    return handle;
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

export async function pickSaveDirectoryWithNativeDialog(): Promise<SaveDirectorySelection | null> {
  const handle = await requestSaveDirectoryPicker();
  if (!handle) return null;
  return { label: handle.name, directoryHandle: handle };
}

export async function saveGeneratedFilesToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  recordId: string,
  files: TravelGeneratedFile[],
): Promise<void> {
  for (const file of files) {
    const response = await fetch(
      `/api/travel/cash-requests/${recordId}/download?type=${encodeURIComponent(file.type)}`,
    );
    if (!response.ok) {
      throw new Error(`Impossible de récupérer ${file.fileName}`);
    }

    const blob = await response.blob();
    const targetHandle = await directoryHandle.getFileHandle(file.fileName, { create: true });
    const writable = await targetHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
}

export function folderSelectionErrorMessage(label: string): string | null {
  if (!label.trim()) return 'Sélectionnez un dossier d\'enregistrement';
  if (isFullWindowsPath(label)) return null;
  return null;
}
