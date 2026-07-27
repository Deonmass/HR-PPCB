import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { getServiceAttestation } from '@/lib/service-attestation-store';
import { checkAnyPermission } from '@/lib/require-permission';

type Params = { params: Promise<{ id: string }> };

function fileContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

export async function GET(request: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'export' },
    { menuId: 'travel.historique', action: 'export' },
    { menuId: 'travel.etablir', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const record = await getServiceAttestation(id);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }

    const type = new URL(request.url).searchParams.get('type');
    if (type === 'pdf') {
      if (!record.pdfPath) {
        return NextResponse.json(
          { error: 'PDF non disponible (Microsoft Office requis sous Windows)' },
          { status: 404 },
        );
      }
      const buffer = await fs.readFile(record.pdfPath);
      const pdfName = record.fileName.replace(/\.docx$/i, '.pdf');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    }

    const buffer = await fs.readFile(record.docxPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileContentType(record.fileName),
        'Content-Disposition': `attachment; filename="${record.fileName}"`,
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
