import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import {
  hsPolicyPdfExists,
  hsPolicyPdfFilename,
  resolveHsPolicyPdfPath,
} from '@/lib/politique-pdf';
import { checkPermission } from '@/lib/require-permission';

export async function GET(request: Request) {
  const denied = await checkPermission('politique.heures-sup', 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'meta';
  const download = searchParams.get('download') === '1';
  const filename = hsPolicyPdfFilename();

  if (mode === 'pdf') {
    try {
      const buffer = await fs.readFile(resolveHsPolicyPdfPath());
      const disposition = download
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch {
      return NextResponse.json({ error: 'PDF introuvable' }, { status: 404 });
    }
  }

  return NextResponse.json({
    title: 'Politique sur les heures supplémentaires finale oct 25',
    hasPdf: hsPolicyPdfExists(),
    filename,
  });
}
