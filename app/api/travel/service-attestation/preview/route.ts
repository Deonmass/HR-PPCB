import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';

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
import { buildServiceAttestationPdfBuffer } from '@/lib/service-attestation-pdf.server';
import type { ServiceAttestationLanguage } from '@/lib/service-attestation-types';
import { auditSimpleAction } from '@/lib/with-audit';

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
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    }

    if (type === 'html') {
      // HTML sans template Word si besoin, mais on préfère le texte du modèle rempli.
      try {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'service-attestation-'));
        const docxPath = path.join(tempDir, 'attestation.docx');
        let previewHtml = '';
        try {
          await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) => {
            const filled = fillServiceAttestationXml(xml, form);
            previewHtml = buildServiceAttestationPreviewHtml(extractDocxPlainText(filled));
            return filled;
          });
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
        return NextResponse.json({ html: previewHtml });
      } catch {
        const { buildServiceAttestationParagraphs } = await import(
          '@/lib/service-attestation-pdf.server'
        );
        const html = buildServiceAttestationPreviewHtml(
          buildServiceAttestationParagraphs(form).join('\n'),
        );
        return NextResponse.json({ html });
      }
    }

    // DOCX export
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'service-attestation-'));
    const docxPath = path.join(tempDir, 'attestation.docx');
    try {
      await writeDocxFromTemplate(SERVICE_ATTESTATION_TEMPLATE_PATH, docxPath, (xml) =>
        fillServiceAttestationXml(xml, form),
      );
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
