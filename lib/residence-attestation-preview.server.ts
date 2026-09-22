import 'server-only';

import JSZip from 'jszip';
import { fillDocxTemplateToBuffer } from './docx-template';
import {
  buildResidenceAttestationParagraphs,
  buildResidenceAttestationPreviewHtml,
  extractDocxPlainText,
  fillResidenceAttestationXml,
  getResidenceAttestationHeaderDataUrl,
  RESIDENCE_ATTESTATION_TEMPLATE_PATH,
} from './residence-attestation-template';
import type { ResidenceAttestationFormData } from './residence-attestation-types';

export async function buildResidenceAttestationPreviewHtmlForForm(
  form: ResidenceAttestationFormData,
): Promise<string> {
  const headerDataUrl = await getResidenceAttestationHeaderDataUrl();
  try {
    const buffer = await fillDocxTemplateToBuffer(RESIDENCE_ATTESTATION_TEMPLATE_PATH, (xml) =>
      fillResidenceAttestationXml(xml, form),
    );
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('document.xml introuvable');
    const xml = await documentFile.async('string');
    return buildResidenceAttestationPreviewHtml(extractDocxPlainText(xml), { headerDataUrl });
  } catch {
    return buildResidenceAttestationPreviewHtml(
      buildResidenceAttestationParagraphs(form).join('\n'),
      { headerDataUrl },
    );
  }
}
