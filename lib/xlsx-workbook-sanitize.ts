import JSZip from 'jszip';

const WORKSHEET_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

function toBuffer(data: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

function ensureWorksheetContentTypes(typesXml: string, zip: JSZip): string {
  let xml = typesXml;
  const listed = new Set(
    [...xml.matchAll(/PartName="(\/xl\/worksheets\/sheet\d+\.xml)"/g)].map((m) => m[1]),
  );
  for (const name of Object.keys(zip.files)) {
    const match = /^xl\/worksheets\/(sheet\d+\.xml)$/.exec(name);
    if (!match) continue;
    const part = `/xl/worksheets/${match[1]}`;
    if (listed.has(part)) continue;
    xml = xml.replace(
      '</Types>',
      `<Override PartName="${part}" ContentType="${WORKSHEET_CT}"/></Types>`,
    );
    listed.add(part);
  }
  return xml;
}

function removeMissingParts(typesXml: string, relsXml: string, zip: JSZip): { types: string; rels: string } {
  let types = typesXml;
  let rels = relsXml;

  const calcExists = Boolean(zip.file('xl/calcChain.xml'));
  if (!calcExists) {
    types = types.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*>/g, '');
    rels = rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*>/g, '');
  }

  const hasExternal = Object.keys(zip.files).some((n) => n.startsWith('xl/externalLinks/'));
  if (!hasExternal) {
    types = types.replace(/<Override PartName="\/xl\/externalLinks\/[^"]+"[^>]*>/g, '');
    rels = rels.replace(
      /<Relationship [^>]*Type="[^"]*externalLink"[^>]*>/g,
      '',
    );
  }

  return { types, rels };
}

function stripExternalLinks(zip: JSZip, workbookXml: string, typesXml: string, relsXml: string) {
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('xl/externalLinks/')) zip.remove(name);
  }
  const workbook = workbookXml.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/g, '');
  const types = typesXml.replace(/<Override PartName="\/xl\/externalLinks\/[^"]+"[^>]*>/g, '');
  const rels = relsXml.replace(/<Relationship [^>]*Type="[^"]*externalLink"[^>]*>/g, '');
  return { workbook, types, rels };
}

function cleanDefinedNames(workbookXml: string): string {
  let xml = workbookXml.replace(/<fileRecoveryPr[^/]*\/>/g, '');
  xml = xml.replace(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/g, (block) => {
    if (/\[[^\]]+\]/.test(block)) return '';
    if (/\$WVT\$/i.test(block)) return '';
    if (/CHECK DOCUMENTS/i.test(block)) return '';
    return block;
  });
  xml = xml.replace(/<definedNames>\s*<\/definedNames>/g, '');
  return xml;
}

function shiftRelativeRefs(formula: string, fromRow: number, toRow: number): string {
  if (fromRow === toRow) return formula;
  const delta = toRow - fromRow;
  return formula.replace(/(^|[^A-Z$])([A-Z]{1,3})(\d+)\b/g, (full, prefix, col, row) => {
    const next = Number(row) + delta;
    return `${prefix}${col}${next}`;
  });
}

function convertSharedFormulas(sheetXml: string): string {
  const masters = new Map<string, { row: number; formula: string }>();
  let xml = sheetXml.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*)>(\s*)<f([^>]*)t="shared"([^>]*)>([^<]*)<\/f>/g,
    (full, col, rowStr, cellAttrs, space, pre, post, formula) => {
      const si = /\bsi="(\d+)"/.exec(`${pre} ${post}`)?.[1];
      const row = Number(rowStr);
      if (si && formula) masters.set(si, { row, formula });
      return `<c r="${col}${rowStr}"${cellAttrs}>${space}<f>${formula}</f>`;
    },
  );

  xml = xml.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*)>(\s*)<f([^>]*)t="shared"([^>]*)\/>/g,
    (full, col, rowStr, cellAttrs, space, pre, post) => {
      const si = /\bsi="(\d+)"/.exec(`${pre} ${post}`)?.[1];
      const master = si ? masters.get(si) : undefined;
      const row = Number(rowStr);
      if (!master) return `<c r="${col}${rowStr}"${cellAttrs}>${space}`;
      const formula = shiftRelativeRefs(master.formula, master.row, row);
      return `<c r="${col}${rowStr}"${cellAttrs}>${space}<f>${formula}</f>`;
    },
  );

  xml = xml.replace(/<f\s*\/>/g, '');
  xml = xml.replace(/<f><\/f>/g, '');
  return xml;
}

function fixHyperlinkRels(relsXml: string): string {
  return relsXml.replace(/Target="([^"]*)"/g, (_full, target: string) => {
    const fixed = String(target).replace(/(&amp;)+/g, '&amp;');
    return `Target="${fixed}"`;
  });
}

/**
 * Corrige les classeurs xlsx-populate qui cassent Excel :
 * Content Types manquants, calcChain fantôme, liens externes, formules shared.
 */
export async function sanitizeXlsxBuffer(input: Buffer | Uint8Array | ArrayBuffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(toBuffer(input));
  let types = (await zip.file('[Content_Types].xml')?.async('string')) || '';
  let rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  let workbook = (await zip.file('xl/workbook.xml')?.async('string')) || '';

  const stripped = stripExternalLinks(zip, workbook, types, rels);
  workbook = cleanDefinedNames(stripped.workbook);
  types = stripped.types;
  rels = stripped.rels;

  const cleaned = removeMissingParts(types, rels, zip);
  types = ensureWorksheetContentTypes(cleaned.types, zip);
  rels = cleaned.rels;

  zip.file('[Content_Types].xml', types);
  zip.file('xl/_rels/workbook.xml.rels', rels);
  zip.file('xl/workbook.xml', workbook);

  for (const name of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const xml = await zip.file(name)!.async('string');
      zip.file(name, convertSharedFormulas(xml));
    }
    if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name)) {
      const xml = await zip.file(name)!.async('string');
      zip.file(name, fixHyperlinkRels(xml));
    }
  }

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return out as Buffer;
}
