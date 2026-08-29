import { NextResponse } from 'next/server';
import { reconcileExcoBase } from '@/lib/exco-base-reconcile';
import {
  displayEngagementName,
  parseEngagementsTerminations,
} from '@/lib/exco-engagements-parse';
import { resolveExcoDepartment } from '@/lib/exco-department-map';
import { syncExcoDepartmentsAndServices } from '@/lib/exco-dept-sync';
import { parseExcoNewReport } from '@/lib/exco-new-report-parse';
import { readExcoUploadBuffer } from '@/lib/exco-uploads';
import {
  getEmployee,
  upsertEmployee,
} from '@/lib/employees-json-store';
import { emptyEmployeeHrProfile } from '@/lib/types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';
import { resolveExcoBaseWorkbook } from '@/lib/exco-base-source';
import { getExcoOverlays } from '@/lib/exco-store';

function periodFrom(url: URL) {
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;
  try {
    const period = periodFrom(new URL(request.url));
    if (!period) return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    const result = await reconcileExcoBase(period);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Réconciliation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Actions Params / BASE :
 * - syncDepartments : créer départements + services (catalogue) — pas les fiches employés
 * - applyEmployeeFix : créer un absent système depuis BASE (jamais écraser nom/dept)
 * - applyAllCorrections : sync catalogue uniquement
 * - importHistoricalExits / applyTerminationsInMonth / importMissingFromBase
 */
export async function POST(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      year?: number;
      month?: number;
      action?: string;
      matricule?: string;
      fields?: Array<'name' | 'position' | 'department'>;
    };
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }

    const action = body.action || '';

    if (action === 'syncDepartments') {
      const sync = await syncExcoDepartmentsAndServices({ year, month });
      await withAudit(
        {
          module: 'exco',
          action: 'update',
          entityType: 'exco-base-sync-depts',
          entityId: `${year}-${month}`,
          summary: `Sync départements/services EXCO · +${sync.createdDepartments} dept · +${sync.createdServices} svc · ${sync.employeesUpdated} emp`,
          path: '/api/exco/base',
          method: 'POST',
        },
        async () => true,
      );
      const result = await reconcileExcoBase({ year, month });
      return NextResponse.json({ ok: true, ...sync, result });
    }

    if (action === 'applyEmployeeFix') {
      const matricule = String(body.matricule || '').trim();
      if (!matricule) return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });

      const current = await getEmployee(matricule);
      if (current) {
        return NextResponse.json(
          {
            error:
              'Nom et département système font foi. Les écarts fichier ne sont pas appliqués.',
          },
          { status: 400 },
        );
      }

      const newReport = await resolveExcoBaseWorkbook(year, month);
      if (!newReport) {
        return NextResponse.json({ error: 'New report.xlsx requis' }, { status: 400 });
      }
      const snap = parseExcoNewReport(newReport.buffer, newReport.originalName);
      const base = snap.employees.find((e) => e.matricule === matricule);
      if (!base) return NextResponse.json({ error: 'Matricule absent de BASE' }, { status: 404 });
      const resolved = resolveExcoDepartment(base.department);
      await upsertEmployee({
        ...emptyEmployeeHrProfile(),
        matricule: base.matricule,
        nom: base.nom,
        departement: resolved.department || base.department,
        departmentHr: resolved.department || base.department,
        position: base.position,
        jobTitle: base.position,
        grade: base.grade,
        gender: base.gender,
        nationality: base.nationality,
        appointmentDate: base.emplDate,
        localisation: base.locationSite,
        statut: 'Active',
        documents: {},
      });
      const result = await reconcileExcoBase({ year, month });
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'applyAllCorrections') {
      const sync = await syncExcoDepartmentsAndServices({ year, month });
      await withAudit(
        {
          module: 'exco',
          action: 'update',
          entityType: 'exco-base-apply-all',
          entityId: `${year}-${month}`,
          summary: `Sync catalogue EXCO · +${sync.createdDepartments} dept · +${sync.createdServices} svc (fiches employés inchangées)`,
          path: '/api/exco/base',
          method: 'POST',
        },
        async () => true,
      );
      const result = await reconcileExcoBase({ year, month });
      return NextResponse.json({
        ok: true,
        applied: 0,
        ...sync,
        result,
        note:
          'Catalogue départements/services synchronisé. Nom et département employés : données système conservées.',
      });
    }

    if (action === 'importHistoricalExits' || action === 'applyTerminationsInMonth') {
      const { overlays } = await getExcoOverlays(year, month);
      let rows = overlays.engagementsImportsByMonth?.[String(month)] || [];
      if (!rows.length) {
        const eng = await readExcoUploadBuffer(year, month, 'engagementsTerminations');
        if (!eng) {
          return NextResponse.json(
            { error: 'Uploadez New Engagements and Terminations' },
            { status: 400 },
          );
        }
        rows = parseEngagementsTerminations(eng.buffer);
      }
      let imported = 0;
      for (const row of rows) {
        if (!row.terminationDate) continue;
        const inMonth = (() => {
          const m = row.terminationDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          return m && Number(m[3]) === year && Number(m[2]) === month;
        })();
        if (action === 'applyTerminationsInMonth' && !inMonth) continue;
        if (action === 'importHistoricalExits' && inMonth) continue;

        const existing = await getEmployee(row.matricule);
        const name = displayEngagementName(row);
        const resolved = resolveExcoDepartment(existing?.departement || existing?.departmentHr || row.orgUnit || '');
        const payload = {
          ...(existing || emptyEmployeeHrProfile()),
          matricule: row.matricule,
          nom: existing?.nom || name || row.lastName,
          departement: existing?.departement || resolved.department || row.orgUnit || '',
          departmentHr: existing?.departmentHr || existing?.departement || resolved.department || row.orgUnit || '',
          position: existing?.position || row.position || '',
          jobTitle: existing?.jobTitle || row.position || '',
          grade: row.grade || existing?.grade || '',
          gender: row.gender || existing?.gender || '',
          nationality: row.nationality || existing?.nationality || '',
          appointmentDate: row.employmentDate || existing?.appointmentDate || '',
          dateOfBirth: row.birthDate || existing?.dateOfBirth || '',
          localisation: existing?.localisation || '',
          dateFinContrat: row.terminationDate,
          raisonExit: row.terminationReason || existing?.raisonExit || '',
          statut: 'Inactive',
          documents: existing?.documents || {},
        };
        await upsertEmployee(payload);
        imported += 1;
      }
      await withAudit(
        {
          module: 'exco',
          action: 'update',
          entityType: 'exco-base-exits',
          entityId: `${year}-${month}`,
          summary: `${action} · ${imported} employés`,
          path: '/api/exco/base',
          method: 'POST',
        },
        async () => true,
      );
      const result = await reconcileExcoBase({ year, month });
      return NextResponse.json({ ok: true, imported, result });
    }

    if (action === 'importMissingFromBase') {
      const newReport = await resolveExcoBaseWorkbook(year, month);
      if (!newReport) {
        return NextResponse.json({ error: 'New report.xlsx requis' }, { status: 400 });
      }
      const snap = parseExcoNewReport(newReport.buffer, newReport.originalName);
      let imported = 0;
      for (const base of snap.employees) {
        const existing = await getEmployee(base.matricule);
        if (existing) continue;
        const resolved = resolveExcoDepartment(base.department);
        await upsertEmployee({
          ...emptyEmployeeHrProfile(),
          matricule: base.matricule,
          nom: base.nom,
          departement: resolved.department || base.department,
          departmentHr: resolved.department || base.department,
          position: base.position,
          jobTitle: base.position,
          grade: base.grade,
          gender: base.gender,
          nationality: base.nationality,
          appointmentDate: base.emplDate,
          localisation: base.locationSite,
          statut: 'Active',
          documents: {},
        });
        imported += 1;
      }
      const result = await reconcileExcoBase({ year, month });
      return NextResponse.json({ ok: true, imported, result });
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
