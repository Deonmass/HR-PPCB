import 'server-only';

import path from 'path';

export function resolveLongServicePdfPath(): string {
  return path.join(
    process.cwd(),
    'Excel',
    'templates',
    'policies',
    'recompense-longs-etats-de-service.pdf',
  );
}
