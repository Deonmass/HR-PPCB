import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';
import { writeDocxFromTemplate } from '@/lib/docx-template';
import { buildLeaveAttestationPdfBuffer } from '@/lib/leave-attestation-pdf.server';
import { buildLeaveAttestationPreviewHtmlForForm } from '@/lib/leave-attestation-preview.server';
import {
  fillLeaveAttestationXml,
  formatLeaveAttestationFileName,
  LEAVE_ATTESTATION_TEMPLATE_PATH,
} from '@/lib/leave-attestation-template';
import type { LeaveAttestationFormData } from '@/lib/leave-attestation-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

function normalizeForm(body: Partial<LeaveAttestationFormData>): LeaveAttestationFormData {
  return {
    documentDate: body.documentDate?.trim() || '',
    leaveStart: body.leaveStart?.trim() || '',
    leaveEnd: body.leaveEnd?.trim() || '',
    hodGenre: body.hodGenre?.trim() || 'Monsieur',
    hodName: body.hodName?.trim() || '',
    hodFunction: body.hodFunction?.trim() || '',
    employeeGenre: body.employeeGenre?.trim() || 'Madame',
    employeeName: body.employeeName?.trim() || '',
    employeeMatricule: body.employeeMatricule?.trim() || '',
    employeeFunction: body.employeeFunction?.trim() || '',
    employeeDepartment: body.employeeDepartment?.trim() || '',
  };
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'documents.attestation-conge', action: 'view' },
    { menuId: 'documents.attestation-conge', action: 'create' },
  ]);
  if (denied) return denied;

  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || 'pdf').toLowerCase();
  if (!['pdf', 'docx', 'html'].includes(type)) {
    return NextResponse.json({ error: 'Type de rendu invalide' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<LeaveAttestationFormData>;
    const form = normalizeForm(body);

    if (type === 'html') {
      const html = await buildLeaveAttestationPreviewHtmlForForm(form);
      return NextResponse.json({ html });
    }

    if (type === 'pdf') {
      const pdfBuffer = await buildLeaveAttestationPdfBuffer(form);
      const pdfName = formatLeaveAttestationFileName(form.employeeName, form.documentDate).replace(
        /\.docx$/i,
        '.pdf',
      );
      await auditSimpleAction({
        module: 'documents.attestation-conge',
        action: 'export',
        summary: `Aperçu PDF attestation congé ${form.employeeName || form.employeeMatricule}`,
      });
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${pdfName}"`,
        },
      });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leave-attestation-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    try {
      await writeDocxFromTemplate(LEAVE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
        fillLeaveAttestationXml(xml, form),
      );
      const fileName = formatLeaveAttestationFileName(form.employeeName, form.documentDate);
      const buffer = await fs.readFile(docxPath);
      await auditSimpleAction({
        module: 'documents.attestation-conge',
        action: 'export',
        summary: `Aperçu DOCX attestation congé ${form.employeeName || form.employeeMatricule}`,
      });
      return new NextResponse(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export / aperçu impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
