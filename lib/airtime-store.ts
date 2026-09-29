import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  buildPhoneRenewalRows,
  isAirtimeSimLine,
  lookupAirtimeQuota,
  matchPersonIndexes,
  phoneRenewalTotal,
  resolveAirtimeCategory,
} from './airtime';
import type { AirtimeAssignment, AirtimeBundle, AirtimeDirectoryPerson, AirtimeGrilleRow, AirtimeLineInput } from './airtime-types';
import { applyContractantPhones, listContractants } from './contractants-store';
import { DURABLE_AIRTIME_KEY, hydrateDurableFile, persistDurableFile } from './durable-fs';
import { applyAirtimePhones, readEmployeesBundle } from './employees-json-store';
import type { ContractantEmployee } from './contractants-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { Employee } from './types';

interface AirtimeJsonLine {
  sr: number | null;
  matricule: string;
  nom: string;
  grade: string;
  centreCout: string;
  title: string;
  societe: string;
  department: string;
  place: string;
  msisdn: string;
  actualAirtime: number | null;
}

interface AirtimeJsonStore {
  updatedAt?: string;
  grille: AirtimeGrilleRow[];
  lines: AirtimeJsonLine[];
}

function airtimePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'airtime.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'airtime.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'airtime.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

async function readAirtimeStore(): Promise<AirtimeJsonStore> {
  const filePath = airtimePath();
  await hydrateDurableFile(DURABLE_AIRTIME_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AirtimeJsonStore>;
    return {
      updatedAt: parsed.updatedAt,
      grille: Array.isArray(parsed.grille) ? parsed.grille : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new Error('Données Airtime introuvables (data/employees/airtime.json).');
    }
    throw err;
  }
}

function readSheets(store: AirtimeJsonStore): { grille: AirtimeGrilleRow[]; rawRows: AirtimeAssignment[] } {
  const grille = store.grille.filter((row) => row.description && row.grade && row.allowanceUsd != null);
  const rawRows: AirtimeAssignment[] = store.lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => line.matricule || line.nom || line.msisdn)
    .map(({ line, lineIndex }) => ({
      lineIndex,
      sr: line.sr,
      matricule: String(line.matricule || '').trim(),
      excelName: line.nom || '',
      excelGrade: line.grade || '',
      excelCentreCout: line.centreCout || '',
      excelTitle: line.title || '',
      excelSociete: line.societe || '',
      excelDepartment: line.department || '',
      excelPlace: line.place || '',
      msisdn: String(line.msisdn || '').trim(),
      actualAirtime: line.actualAirtime,
      simLine: isAirtimeSimLine(line.nom || ''),
      matched: false,
      contractantMatched: false,
      contractantId: '',
      contractantEmployeeId: '',
      compagnie: line.societe || '',
      nom: line.nom || '',
      grade: line.grade || '',
      departement: line.department || '',
      centreCout: line.centreCout || '',
      position: line.title || '',
      jobTitle: line.title || '',
      localisation: line.place || '',
      telephone: String(line.msisdn || '').trim(),
      grilleCategory: '',
      quotaAirtime: null,
      ecart: null,
    }));
  return { grille, rawRows };
}

function indexEmployees(employees: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>();
  for (const employee of employees) {
    const key = employee.matricule.trim();
    if (key && !map.has(key)) map.set(key, employee);
  }
  return map;
}

interface ContractantHit {
  contractantId: string;
  employee: ContractantEmployee;
  compagnie: string;
}

function indexContractants(people: ContractantHit[]): { names: string[]; people: ContractantHit[] } {
  return { names: people.map((item) => item.employee.nom), people };
}

function enrich(
  rawRows: AirtimeAssignment[],
  grille: AirtimeGrilleRow[],
  byMatricule: Map<string, Employee>,
  contractants: { names: string[]; people: ContractantHit[] },
): AirtimeAssignment[] {
  return rawRows.map((row) => {
    const employee = row.matricule ? byMatricule.get(row.matricule) : undefined;
    const simLine = row.simLine || isAirtimeSimLine(row.excelName);
    const contractantIndexes = !employee && !simLine && row.excelName
      ? matchPersonIndexes(row.excelName, contractants.names)
      : [];
    const sameCompany = contractantIndexes.length > 0
      && contractantIndexes.every((index) => contractants.people[index]?.compagnie === contractants.people[contractantIndexes[0]]?.compagnie);
    const contractant = sameCompany ? contractants.people[contractantIndexes[0]] : undefined;
    const grade = employee?.grade?.trim() || row.excelGrade;
    const position = employee?.position?.trim()
      || employee?.jobTitle?.trim()
      || contractant?.employee.fonction?.trim()
      || row.excelTitle;
    const category = resolveAirtimeCategory(grade, position);
    const quota = lookupAirtimeQuota(grille, category, grade);
    const actual = row.actualAirtime;
    return {
      ...row,
      matched: Boolean(employee),
      simLine,
      contractantMatched: Boolean(contractant),
      contractantId: contractant?.contractantId || '',
      contractantEmployeeId: contractant?.employee.id || '',
      compagnie: employee?.company?.trim() || contractant?.compagnie || row.excelSociete,
      nom: employee?.nom?.trim() || contractant?.employee.nom?.trim() || row.excelName,
      grade,
      departement: employee?.departement?.trim() || contractant?.employee.departement?.trim() || row.excelDepartment,
      centreCout: employee?.centreCout?.trim() || row.excelCentreCout,
      position,
      jobTitle: employee?.jobTitle?.trim() || contractant?.employee.fonction?.trim() || row.excelTitle,
      localisation: employee?.localisation?.trim() || contractant?.employee.lieuAffectation?.trim() || row.excelPlace,
      telephone: row.msisdn || employee?.telephone || contractant?.employee.telephone || '',
      grilleCategory: category,
      quotaAirtime: quota,
      ecart: quota != null && actual != null ? quota - actual : null,
    };
  });
}

export async function getAirtimeBundle(): Promise<AirtimeBundle> {
  const store = await readAirtimeStore();
  const { grille, rawRows } = readSheets(store);
  const { employees, exits } = await readEmployeesBundle();
  const contractantList = await listContractants();
  const contractantPeople: ContractantHit[] = [];
  for (const contractant of contractantList) {
    for (const employee of contractant.employees) {
      if (employee.dateSortie?.trim()) continue;
      if (!employee.nom.trim()) continue;
      contractantPeople.push({
        contractantId: contractant.id,
        employee,
        compagnie: contractant.denomination,
      });
    }
  }
  const byMatricule = indexEmployees([...employees, ...exits]);
  const rows = enrich(rawRows, grille, byMatricule, indexContractants(contractantPeople));

  const phonesSynced = await applyAirtimePhones(
    rows
      .filter((row) => row.matched && row.msisdn)
      .map((row) => ({ matricule: row.matricule, telephone: row.msisdn })),
  );
  await applyContractantPhones(
    rows
      .filter((row) => row.contractantMatched && row.msisdn)
      .map((row) => ({
        contractantId: row.contractantId,
        employeeId: row.contractantEmployeeId,
        telephone: row.msisdn,
      })),
  );

  const ppc = rows.filter((row) => row.matched);
  const contractantRows = rows.filter((row) => row.contractantMatched);
  const withNumber = rows.filter((row) => row.msisdn).length;
  const matched = ppc.length + contractantRows.length;
  const available = rows.filter((row) => row.msisdn && !row.matched && !row.contractantMatched && !row.simLine);
  const placeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { count: number; quota: number }>();
  let totalQuota = 0;
  let totalActual = 0;

  for (const row of rows) {
    const place = row.localisation || row.excelPlace || '—';
    placeCounts.set(place, (placeCounts.get(place) || 0) + 1);
    const cat = row.grilleCategory || '—';
    const current = categoryCounts.get(cat) || { count: 0, quota: 0 };
    current.count += 1;
    current.quota += row.quotaAirtime || 0;
    categoryCounts.set(cat, current);
    totalQuota += row.quotaAirtime || 0;
    totalActual += row.actualAirtime || 0;
  }

  const phoneRenewal = buildPhoneRenewalRows(rows.map((row) => row.excelGrade));

  return {
    source: 'data/employees/airtime.json',
    updatedAt: store.updatedAt || new Date().toISOString(),
    grille,
    rows,
    phonesSynced,
    stats: {
      totalLines: rows.length,
      withNumber,
      withoutNumber: rows.length - withNumber,
      matched,
      unmatched: rows.length - matched,
      availableNumbers: available.length,
      ppcTotal: ppc.length,
      ppcWithCug: ppc.filter((row) => row.msisdn).length,
      ppcWithoutCug: ppc.filter((row) => !row.msisdn).length,
      contractantTotal: contractantRows.length,
      contractantWithCug: contractantRows.filter((row) => row.msisdn).length,
      contractantWithoutCug: contractantRows.filter((row) => !row.msisdn).length,
      simLines: rows.filter((row) => row.simLine).length,
      totalQuota,
      totalActual,
      byPlace: [...placeCounts.entries()]
        .map(([place, count]) => ({ place, count }))
        .sort((a, b) => b.count - a.count),
      byCategory: [...categoryCounts.entries()]
        .map(([category, value]) => ({ category, ...value }))
        .sort((a, b) => b.count - a.count),
      phoneRenewal,
      phoneRenewalTotal: phoneRenewalTotal(phoneRenewal),
    },
  };
}

function cleanLine(input: AirtimeLineInput, sr: number | null): AirtimeJsonLine {
  const actual = input.actualAirtime;
  const line: AirtimeJsonLine = {
    sr,
    matricule: String(input.matricule || '').trim(),
    nom: String(input.nom || '').trim(),
    grade: String(input.grade || '').trim(),
    centreCout: String(input.centreCout || '').trim(),
    title: String(input.title || '').trim(),
    societe: String(input.societe || '').trim(),
    department: String(input.department || '').trim(),
    place: String(input.place || '').trim(),
    msisdn: String(input.msisdn || '').trim(),
    actualAirtime: actual == null || Number.isNaN(Number(actual)) ? null : Number(actual),
  };
  if (!line.matricule && !line.nom && !line.msisdn) {
    throw new Error('Indiquez un nom, un matricule ou un numéro.');
  }
  return line;
}

async function writeAirtimeStore(store: AirtimeJsonStore): Promise<void> {
  const filePath = airtimePath();
  const next = { ...store, updatedAt: new Date().toISOString() };
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8');
  await persistDurableFile(DURABLE_AIRTIME_KEY, filePath);
}

export async function createAirtimeLine(input: AirtimeLineInput): Promise<AirtimeBundle> {
  const store = await readAirtimeStore();
  const sr = store.lines.reduce((max, line) => Math.max(max, Number(line.sr) || 0), 0) + 1;
  store.lines.push(cleanLine(input, sr));
  await writeAirtimeStore(store);
  return getAirtimeBundle();
}

export async function updateAirtimeLine(lineIndex: number, input: AirtimeLineInput): Promise<AirtimeBundle> {
  const store = await readAirtimeStore();
  const current = store.lines[lineIndex];
  if (!current) throw new Error('Ligne introuvable.');
  store.lines[lineIndex] = cleanLine(input, current.sr);
  await writeAirtimeStore(store);
  return getAirtimeBundle();
}

export async function listAirtimeDirectory(): Promise<AirtimeDirectoryPerson[]> {
  const { employees } = await readEmployeesBundle();
  const contractants = await listContractants();
  const people: AirtimeDirectoryPerson[] = [];
  for (const employee of employees) {
    if (/^(inact|exit)/i.test(employee.statut || '')) continue;
    if (!employee.nom.trim() && !employee.matricule.trim()) continue;
    people.push({
      key: `ppc:${employee.matricule}`,
      kind: 'ppc',
      nom: employee.nom,
      matricule: employee.matricule,
      societe: employee.company || 'PPC',
      grade: employee.grade || '',
      department: employee.departement || '',
      centreCout: employee.centreCout || '',
      title: employee.position || employee.jobTitle || '',
      place: employee.localisation || '',
      telephone: employee.telephone || '',
    });
  }
  for (const contractant of contractants) {
    for (const employee of contractant.employees) {
      if (employee.dateSortie?.trim()) continue;
      if (!employee.nom.trim()) continue;
      people.push({
        key: `ct:${contractant.id}:${employee.id}`,
        kind: 'contractant',
        nom: employee.nom,
        matricule: employee.matriculePpc || '',
        societe: contractant.denomination,
        grade: '',
        department: employee.departement || '',
        centreCout: '',
        title: employee.fonction || '',
        place: employee.lieuAffectation || '',
        telephone: employee.telephone || '',
      });
    }
  }
  people.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.matricule.localeCompare(b.matricule, 'fr'));
  return people;
}

export async function deleteAirtimeLine(lineIndex: number): Promise<AirtimeBundle> {
  const store = await readAirtimeStore();
  if (!store.lines[lineIndex]) throw new Error('Ligne introuvable.');
  store.lines.splice(lineIndex, 1);
  await writeAirtimeStore(store);
  return getAirtimeBundle();
}
