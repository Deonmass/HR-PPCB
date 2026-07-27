import fs from 'fs';
import JSZip from 'jszip';

const zip = await JSZip.loadAsync(fs.readFileSync('Excel/export-templates/VILLAGE_EXPORT_TEMPLATE.xlsx'));
const reF = /<c:f>([^<]+)<\/c:f>/g;
const reT = /<a:t>([^<]*)<\/a:t>/g;

for (const name of ['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/drawings/drawing1.xml']) {
  const txt = await zip.file(name).async('string');
  console.log('\n====', name, '====');
  const refs = [...txt.matchAll(reF)].map((m) => m[1]);
  const titles = [...txt.matchAll(reT)].map((m) => m[1]).filter(Boolean).slice(0, 40);
  console.log('titles', titles);
  console.log('refs', [...new Set(refs)]);
}

for (const f of Object.keys(zip.files).filter((n) => n.includes('worksheets/_rels'))) {
  console.log('\n', f);
  console.log(await zip.file(f).async('string'));
}
