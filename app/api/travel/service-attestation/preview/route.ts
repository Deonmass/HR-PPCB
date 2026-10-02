import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';

import { checkAnyPermission } from '@/lib/require-permission';
import type { ServiceAttestationFormData } from '@/lib/service-attestation-types';
import { buildServiceAttestationPreviewHtmlForForm } from '@/lib/service-attestation-preview.server';
import { writeDocxFromTemplate } from '@/lib/docx-template';
import { buildServiceAttestationPdfBuffer } from '@/lib/service-attestation-pdf.server';
import type { ServiceAttestationLanguage } from '@/lib/service-attestation-types';
import { auditSimpleAction } from '@/lib/with-audit';
import { splitBilingualServiceForm } from '@/lib/service-attestation-agent';
import {
  fillBilingualServiceAttestationXml,
  fillServiceAttestationXml,
  formatServiceAttestationFileName,
  SERVICE_ATTESTATION_TEMPLATE_PATH,
} from '@/lib/service-attestation-template';

function toLanguage(value: unknown): ServiceAttestationLanguage {
  if (value === 'en') return 'en';
  if (value === 'both') return 'both';
  return 'fr';
}

function normalizeForm(body: Partial<ServiceAttestationFormData>): ServiceAttestationFormData {
  return {
    language: toLanguage(body.language),
    documentDate: body.documentDate?.trim() || '',
    hodGenre: body.hodGenre?.trim() || 'Monsieur',
    hodName: body.hodName?.trim() || '',
    hodFunction: body.hodFunction?.trim() || '',
    hodFunctionEn: body.hodFunctionEn?.trim() || undefined,
    employeeGenre: body.employeeGenre?.trim() || 'Monsieur',
    employeeGenreEn: body.employeeGenreEn?.trim() || undefined,
    employeeName: body.employeeName?.trim() || '',
    employeeMatricule: body.employeeMatricule?.trim() || '',
    dateEmbauche: body.dateEmbauche?.trim() || '',
    employeeFunction: body.employeeFunction?.trim() || '',
    employeeFunctionEn: body.employeeFunctionEn?.trim() || undefined,
    employeeDepartment: body.employeeDepartment?.trim() || '',
    bodyText: body.bodyText?.trim() || undefined,
    bodyTextEn: body.bodyTextEn?.trim() || undefined,
  };
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'view' },
    { menuId: 'travel.attestation', action: 'create' },
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

    if (type === 'html') {
      const html = await buildServiceAttestationPreviewHtmlForForm(form);
      return NextResponse.json({ html });
    }

    if (type === 'pdf') {
      const pdfBuffer = await buildServiceAttestationPdfBuffer(form);
      const pdfName = formatServiceAttestationFileName(
        form.employeeName,
        form.documentDate,
        form.language,
      ).replace(/\.docx$/i, '.pdf');
      await auditSimpleAction({
        module: 'travel.attestation',
        action: 'export',
        summary: `Aperçu PDF attestation ${form.employeeName || form.employeeMatricule}`,
      });
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${pdfName}"`,
        },
      });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'service-attestation-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    try {
      if (form.language === 'both') {
        const { fr, en } = splitBilingualServiceForm(form);
        await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
          fillBilingualServiceAttestationXml(xml, fr, en),
        );
      } else {
        await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
          fillServiceAttestationXml(xml, form),
        );
      }
      const fileName = formatServiceAttestationFileName(
        form.employeeName,
        form.documentDate,
        form.language,
      );
      const buffer = await fs.readFile(docxPath);
      await auditSimpleAction({
        module: 'travel.attestation',
        action: 'export',
        summary: `Aperçu DOCX attestation ${form.employeeName || form.employeeMatricule}`,
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
