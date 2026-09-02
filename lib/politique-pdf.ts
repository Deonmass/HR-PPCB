import 'server-only';

import fs from 'fs';
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

const HS_POLICY_PDF_NAMES = [
  'politique-heures-supplementaires-oct-25.pdf',
  'Politique sur les heures supplémentaires finale oct 25.pdf',
  'PPCB-LG-POL-HR-0032.pdf',
];

export function resolveHsPolicyPdfPath(): string {
  const dir = path.join(process.cwd(), 'Excel', 'templates', 'policies');
  for (const name of HS_POLICY_PDF_NAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, HS_POLICY_PDF_NAMES[0]);
}

export function hsPolicyPdfExists(): boolean {
  return fs.existsSync(resolveHsPolicyPdfPath());
}

export function hsPolicyPdfFilename(): string {
  return path.basename(resolveHsPolicyPdfPath());
}

export function resolvePolitiqueDocPdfPath(filename: string): string {
  return path.join(process.cwd(), 'Excel', 'templates', 'policies', filename);
}
