import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { buildResidenceAttestationPdfBuffer } from '@/lib/residence-attestation-pdf.server';
import { getResidenceAttestation } from '@/lib/residence-attestation-store';
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
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-residence', action: 'export' }]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const record = await getResidenceAttestation(id);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }

    const type = new URL(request.url).searchParams.get('type');
    if (type === 'pdf') {
      const buffer = await buildResidenceAttestationPdfBuffer(record);
      const pdfName = record.fileName.replace(/\.docx$/i, '.pdf');
      await auditSimpleAction({
        module: 'documents.attestation-residence',
        action: 'export',
        summary: `Téléchargement PDF attestation résidence ${record.employeeName || id}`,
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
      module: 'documents.attestation-residence',
      action: 'export',
      summary: `Téléchargement DOCX attestation résidence ${record.employeeName || id}`,
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
