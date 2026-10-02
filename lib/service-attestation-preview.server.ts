import 'server-only';

import JSZip from 'jszip';
import { fillDocxTemplateToBuffer } from './docx-template';
import { buildServiceAttestationParagraphs } from './service-attestation-pdf.server';
import { splitBilingualServiceForm } from './service-attestation-agent';
import {
  buildServiceAttestationPreviewHtml,
  extractDocxPlainText,
  fillBilingualServiceAttestationXml,
  fillServiceAttestationXml,
  getServiceAttestationHeaderDataUrl,
  SERVICE_ATTESTATION_TEMPLATE_PATH,
} from './service-attestation-template';
import type { ServiceAttestationFormData } from './service-attestation-types';

export async function buildServiceAttestationPreviewHtmlForForm(
  form: ServiceAttestationFormData,
): Promise<string> {
  const headerDataUrl = await getServiceAttestationHeaderDataUrl();
  try {
    const buffer = await fillDocxTemplateToBuffer(SERVICE_ATTESTATION_TEMPLATE_PATH, (xml) => {
      if (form.language === 'both') {
        const { fr, en } = splitBilingualServiceForm(form);
        return fillBilingualServiceAttestationXml(xml, fr, en);
      }
      return fillServiceAttestationXml(xml, form);
    });
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('document.xml introuvable');
    const xml = await documentFile.async('string');
    return buildServiceAttestationPreviewHtml(extractDocxPlainText(xml), { headerDataUrl });
  } catch {
    if (form.language === 'both') {
      const { fr, en } = splitBilingualServiceForm(form);
      return buildServiceAttestationPreviewHtml(
        [...buildServiceAttestationParagraphs(fr), '---', ...buildServiceAttestationParagraphs(en)].join(
          '\n',
        ),
        { headerDataUrl },
      );
    }
    return buildServiceAttestationPreviewHtml(
      buildServiceAttestationParagraphs(form).join('\n'),
      { headerDataUrl },
    );
  }
}
