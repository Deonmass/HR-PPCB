import 'server-only';

import { withExcelLock } from './excel-io';
import {
  DURABLE_PARAMS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { resolveWorkbookPath } from './runtime-mode';

export function getParamsPath(): string {
  return resolveWorkbookPath('Params.xlsx', process.env.PARAMS_XLSX);
}

/**
 * Serialize Params.xlsx access and sync with durable remote storage on Vercel.
 * Pass `{ persist: true }` for any mutation (users, permissions, departments…).
 */
export async function withParamsLock<T>(
  fn: () => Promise<T>,
  options?: { persist?: boolean },
): Promise<T> {
  const filePath = getParamsPath();
  return withExcelLock(filePath, async () => {
    await hydrateDurableFile(DURABLE_PARAMS_KEY, filePath);
    const result = await fn();
    if (options?.persist) {
      await persistDurableFile(DURABLE_PARAMS_KEY, filePath);
    }
    return result;
  });
}
