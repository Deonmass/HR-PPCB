import fs from 'fs';

const xml = fs.readFileSync('tmp-tpl/xl/worksheets/sheet1.xml', 'utf8');
for (const row of [6, 7, 8, 9, 10, 15, 16, 17]) {
  const match = xml.match(new RegExp(`<row r="${row}"[^>]*>([\\s\\S]*?)<\\/row>`));
  if (!match) continue;
  const cells = [...match[1].matchAll(/<c r="([A-S]\d+)"[^>]*(?:\/>|>)/g)].map((m) => {
    const s = match[1].match(new RegExp(`<c r="${m[1]}"[^>]*s="(\\d+)"`));
    return `${m[1]}:s${s?.[1] ?? '?'}`;
  });
  console.log(`row ${row}`, cells.join(' '));
}
