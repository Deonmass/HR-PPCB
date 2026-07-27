import fs from 'fs';

const xml = fs.readFileSync('tmp-tpl/xl/worksheets/sheet1.xml', 'utf8');
const styles = fs.readFileSync('tmp-tpl/xl/styles.xml', 'utf8');
const xfs = [...styles.matchAll(/<xf ([^/]*?)\/>/g)].map((m, i) => ({ i, attrs: m[1] }));

for (let row = 9; row <= 20; row += 1) {
  const match = xml.match(new RegExp(`<row r="${row}"[^>]*>([\\s\\S]*?)<\\/row>`));
  if (!match) continue;
  const styleIds = [...new Set([...match[1].matchAll(/s="(\d+)"/g)].map((m) => m[1]))];
  const ws = match[1].match(/<c r="C\d+" t="s" s="\d+"><v>(\d+)<\/v>/);
  console.log(`row ${row} styles=${styleIds.join(',')} C=${ws?.[1] ?? '?'}`);
}

console.log('\nxf with fill:');
xfs.forEach(({ i, attrs }) => {
  if (attrs.includes('fillId="0"')) return;
  console.log(i, attrs);
});
