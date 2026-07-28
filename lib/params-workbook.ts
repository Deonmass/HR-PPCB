import 'server-only';

/**
 * Legacy Params.xlsx path helpers — used only for one-shot seed / inspection.
 * App read/write goes through JSON stores (data/settings/*, data/auth/users.json).
 */

import { resolveWorkbookPath } from './runtime-mode';

export function getParamsPath(): string {
  return resolveWorkbookPath('Params.xlsx', process.env.PARAMS_XLSX);
}
