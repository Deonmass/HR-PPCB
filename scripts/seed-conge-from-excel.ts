/**
 * Seed data/employees/conge.json from the Finance Leave Excel (not committed).
 *
 * Run: node --import tsx scripts/seed-conge-from-excel.ts
 *   or: npx tsx scripts/seed-conge-from-excel.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { parseCongeWorkbookFromFile } from '../lib/conge-import';

const DEFAULT_SRC = String.raw`d:\Agents\Cug Kiesse\Planning de congé\Projects\Finance Leave template MAJ--.xlsx`;

async function main() {
  const src = process.argv[2] || process.env.CONGE_XLSX || DEFAULT_SRC;
  const out = path.join(process.cwd(), 'data', 'employees', 'conge.json');
  const parsed = await parseCongeWorkbookFromFile(src, path.basename(src));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(parsed.store, null, 2)}\n`, 'utf8');
  const al = parsed.store.employees.reduce(
    (n, e) => n + Object.values(e.days).filter((c) => c === 'AL').length,
    0,
  );
  console.log(JSON.stringify({
    out,
    employees: parsed.store.employees.length,
    skippedRows: parsed.skippedRows,
    dayColumns: parsed.dayColumns,
    storedDayCodes: parsed.storedDayCodes,
    alDays: al,
    rangeStart: parsed.store.rangeStart,
    rangeEnd: parsed.store.rangeEnd,
    exerciseYear: parsed.store.exerciseYear,
    grades: parsed.store.grades.length,
    seniorityBands: parsed.store.seniorityBands.length,
    source: parsed.store.source,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
