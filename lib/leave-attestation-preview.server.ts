import 'server-only';

import JSZip from 'jszip';
import { fillDocxTemplateToBuffer } from './docx-template';
import {
  buildLeaveAttestationParagraphs,
  buildLeaveAttestationPreviewHtml,
  extractDocxPlainText,
  fillBilingualLeaveAttestationXml,
  fillLeaveAttestationXml,
  getLeaveAttestationHeaderDataUrl,
  LEAVE_ATTESTATION_TEMPLATE_PATH,
} from './leave-attestation-template';
import { splitBilingualLeaveForm } from './leave-attestation-agent';
import type { LeaveAttestationFormData } from './leave-attestation-types';

export async function buildLeaveAttestationPreviewHtmlForForm(
  form: LeaveAttestationFormData,
): Promise<string> {
  const headerDataUrl = await getLeaveAttestationHeaderDataUrl();
  try {
    const buffer = await fillDocxTemplateToBuffer(LEAVE_ATTESTATION_TEMPLATE_PATH, (xml) => {
      if (form.language === 'both') {
        const { fr, en } = splitBilingualLeaveForm(form);
        return fillBilingualLeaveAttestationXml(xml, fr, en);
      }
      return fillLeaveAttestationXml(xml, form);
    });
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('document.xml introuvable');
    const xml = await documentFile.async('string');
    return buildLeaveAttestationPreviewHtml(extractDocxPlainText(xml), { headerDataUrl });
  } catch {
    if (form.language === 'both') {
      const { fr, en } = splitBilingualLeaveForm(form);
      return buildLeaveAttestationPreviewHtml(
        [...buildLeaveAttestationParagraphs(fr), '---', ...buildLeaveAttestationParagraphs(en)].join(
          '\n',
        ),
        { headerDataUrl },
      );
    }
    return buildLeaveAttestationPreviewHtml(
      buildLeaveAttestationParagraphs(form).join('\n'),
      { headerDataUrl },
    );
  }
}
