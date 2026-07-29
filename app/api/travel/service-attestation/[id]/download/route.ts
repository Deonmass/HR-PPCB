import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { getServiceAttestation } from '@/lib/service-attestation-store';
import { buildServiceAttestationPdfBuffer } from '@/lib/service-attestation-pdf.server';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

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
      let buffer: Buffer | null = null;
      if (record.pdfPath) {
        try {
          buffer = await fs.readFile(record.pdfPath);
        } catch {
          buffer = null;
        }
      }
      if (!buffer) {
        buffer = await buildServiceAttestationPdfBuffer(record);
      }
      const pdfName = record.fileName.replace(/\.docx$/i, '.pdf');
      await auditSimpleAction({
        module: 'travel.attestation',
        action: 'export',
        summary: `Téléchargement PDF attestation ${record.employeeName || id}`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    }

    const buffer = await fs.readFile(record.docxPath);
    await auditSimpleAction({
      module: 'travel.attestation',
      action: 'export',
      summary: `Téléchargement DOCX attestation ${record.employeeName || id}`,
    });
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileContentType(record.fileName),
        'Content-Disposition': `attachment; filename="${record.fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Téléchargement impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
