import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { getPolitiqueDoc } from '@/lib/politique-docs';
import { resolvePolitiqueDocPdfPath } from '@/lib/politique-pdf';
import { checkPermission } from '@/lib/require-permission';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const doc = getPolitiqueDoc(slug);
  if (!doc) return NextResponse.json({ error: 'Document inconnu' }, { status: 404 });

  const denied = await checkPermission(doc.menuId, 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'meta';
  const download = searchParams.get('download') === '1';
  const filename = doc.pdfFile;

  if (mode === 'pdf') {
    try {
      const buffer = await fs.readFile(resolvePolitiqueDocPdfPath(filename));
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
    id: doc.id,
    title: doc.title,
    filename,
    totalPages: doc.totalPages,
  });
}
