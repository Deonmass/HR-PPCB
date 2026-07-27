import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';

import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import type { ServiceAttestationFormData } from '@/lib/service-attestation-types';
import {
  buildServiceAttestationPreviewHtml,
  extractDocxPlainText,
  fillServiceAttestationXml,
  formatServiceAttestationFileName,
  SERVICE_ATTESTATION_TEMPLATE_PATH,
} from '@/lib/service-attestation-template';
import { writeDocxFromTemplate } from '@/lib/docx-template';
import { convertDocxToPdf } from '@/lib/travel-pdf';

import type { ServiceAttestationLanguage } from '@/lib/service-attestation-types';

function toLanguage(value: unknown): ServiceAttestationLanguage {
  return value === 'en' ? 'en' : 'fr';
}

function normalizeForm(body: Partial<ServiceAttestationFormData>): ServiceAttestationFormData {
  return {
    language: toLanguage(body.language),
    documentDate: body.documentDate?.trim() || '',
    hodGenre: body.hodGenre?.trim() || 'Monsieur',
    hodName: body.hodName?.trim() || '',
    hodFunction: body.hodFunction?.trim() || '',
    employeeGenre: body.employeeGenre?.trim() || 'Monsieur',
    employeeName: body.employeeName?.trim() || '',
    employeeMatricule: body.employeeMatricule?.trim() || '',
    dateEmbauche: body.dateEmbauche?.trim() || '',
    employeeFunction: body.employeeFunction?.trim() || '',
    employeeDepartment: body.employeeDepartment?.trim() || '',
  };
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'view' },
    { menuId: 'travel.historique', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
  ]);
  if (denied) return denied;

  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || 'pdf').toLowerCase();
  if (!['pdf', 'docx', 'html'].includes(type)) {
    return NextResponse.json({ error: 'Type de rendu invalide' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<ServiceAttestationFormData>;
    const form = normalizeForm(body);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'service-attestation-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    const pdfPath = path.join(tempDir, 'attestation.pdf');

    let previewHtml = '';

    try {
      await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) => {
        const filled = fillServiceAttestationXml(xml, form);
        if (type === 'html') {
          previewHtml = buildServiceAttestationPreviewHtml(extractDocxPlainText(filled));
        }
        return filled;
      });

      if (type === 'html') {
        return NextResponse.json({ html: previewHtml });
      }

      if (type === 'docx') {
        const fileName = formatServiceAttestationFileName(
          form.employeeName,
          form.documentDate,
          form.language,
        );
        const buffer = await fs.readFile(docxPath);
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${fileName}"`,
          },
        });
      }

      await convertDocxToPdf(docxPath, pdfPath);
      const pdfBuffer = await fs.readFile(pdfPath);
      const pdfName = formatServiceAttestationFileName(
        form.employeeName,
        form.documentDate,
        form.language,
      ).replace(/\.docx$/i, '.pdf');

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

