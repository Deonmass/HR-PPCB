import path from 'path';
import { getWritableDataRoot } from './runtime-mode';
import { getTravelSaveBaseDirectory, resolveTravelSaveDirectory } from './travel-paths';

/** True when `target` is `root` or a file/folder inside it. */
export function isInsideRoot(root: string, target: string): boolean {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  const relative = path.relative(base, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function allowedAppRoots(): string[] {
  const roots = [
    path.join(process.cwd(), 'Excel'),
    path.join(process.cwd(), 'data', 'travel'),
    path.join(getWritableDataRoot(), 'travel'),
    getTravelSaveBaseDirectory(),
    resolveTravelSaveDirectory(),
  ];
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

/** Refuse a path that escapes the application data, templates, or travel folders. */
export function assertAllowedPath(target: string): string {
  const resolved = path.resolve(target);
  if (!allowedAppRoots().some((root) => isInsideRoot(root, resolved))) {
    throw new Error('Chemin refusé');
  }
  return resolved;
}
