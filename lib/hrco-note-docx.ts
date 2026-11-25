import JSZip from 'jszip';
import type { HrcoCell, HrcoNote, HrcoRow, HrcoTable } from './hrco-note';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function run(text: string, options?: { bold?: boolean; size?: number; color?: string }): string {
  const props: string[] = [];
  if (options?.bold) props.push('<w:b/>');
  if (options?.size) props.push(`<w:sz w:val="${options.size}"/>`, `<w:szCs w:val="${options.size}"/>`);
  if (options?.color) props.push(`<w:color w:val="${options.color}"/>`);
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(text: string, options?: { bold?: boolean; size?: number; color?: string; after?: number }): string {
  const after = options?.after ?? 120;
  return `<w:p><w:pPr><w:spacing w:after="${after}" w:before="0"/></w:pPr>${run(text, options)}</w:p>`;
}

function cellXml(cell: HrcoCell | null, options?: { header?: boolean; total?: boolean }): string {
  const fill = options?.header ? 'F4F4F5' : options?.total ? 'F3F4F6' : 'FFFFFF';
  const color = '111111';
  const text = cell?.text || '';
  return `<w:tc>
    <w:tcPr>
      <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p><w:pPr><w:spacing w:after="40" w:before="40"/></w:pPr>${run(text, {
      bold: Boolean(options?.header || options?.total),
      size: options?.header ? 16 : 18,
      color,
    })}</w:p>
  </w:tc>`;
}

function tableXml(item: HrcoTable): string {
  const header = `<w:tr>${item.columns.map((column) => cellXml({ text: column, source: 'document' }, { header: true })).join('')}</w:tr>`;
  const body = item.rows
    .map((row: HrcoRow) => `<w:tr>${row.cells.map((cell) => cellXml(cell, { total: row.total })).join('')}</w:tr>`)
    .join('');
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
      </w:tblBorders>
    </w:tblPr>
    ${header}
    ${body}
  </w:tbl>`;
}

export async function buildHrcoNoteDocx(note: HrcoNote): Promise<Buffer> {
  const blocks: string[] = [
    paragraph(note.title, { bold: true, size: 32, color: '1F4E79', after: 80 }),
    paragraph(`Comité du ${note.committeeDate}`, { size: 22, after: 40 }),
    paragraph(
      `Période ${note.periodLabel}. Effectifs en poste au ${note.asOfLabel} : ${note.headcount}. Les cellules sans donnée sont laissées vides. Les montants repris de la note d’origine ne sont pas recalculés.`,
      { size: 20, after: 200 },
    ),
  ];

  for (const section of note.sections) {
    blocks.push(paragraph(section.title, { bold: true, size: 26, color: '1F4E79', after: 80 }));
    for (const point of section.points) {
      blocks.push(paragraph(`• ${point}`, { size: 20, after: 40 }));
    }
    for (const item of section.tables) {
      const owner = item.owner ? ` — ${item.owner}` : '';
      blocks.push(paragraph(`${item.title}${owner}`, { bold: true, size: 21, after: 40 }));
      blocks.push(paragraph(item.source, { size: 16, color: '6B7280', after: 80 }));
      blocks.push(tableXml(item));
      blocks.push(paragraph('', { after: 160 }));
    }
  }

  blocks.push(paragraph('Alexander Bamanisa Kenzi', { bold: true, size: 22, after: 0 }));
  blocks.push(paragraph('Président du Comité des Ressources Humaines', { size: 20, after: 0 }));
  blocks.push(paragraph('PPC Barnet', { size: 20, after: 0 }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${blocks.join('')}
    <w:sectPr>
      <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder('word')?.file('document.xml', documentXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}
