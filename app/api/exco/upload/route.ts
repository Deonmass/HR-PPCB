import { NextResponse } from 'next/server';
import { EXCO_SOURCE_FILES, type ExcoSourceFileId } from '@/lib/exco-source-files';
import { deleteExcoUpload, listExcoUploads, saveExcoUpload } from '@/lib/exco-uploads';
import { getExcoOverlays, saveExcoOverlays } from '@/lib/exco-store';
import {
  buildExcoLeaveMonthImport,
  buildExcoOtMonthImport,
  identityByMatriculeFromEmployees,
} from '@/lib/exco-ot-import';
import { parseEngagementsTerminations } from '@/lib/exco-engagements-parse';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';
import type { ExcoManualKpis, ExcoOverlays } from '@/lib/exco-types';

const SOURCE_IDS = new Set(EXCO_SOURCE_FILES.map((f) => f.id));

const IMPORT_KPI_KEYS = ['overtimeCost', 'leaveCost', 'leaveBalanceAvgDays'] as const;

function dropMonthKey<T>(map: Record<string, T> | undefined, month: number): Record<string, T> {
  const next = { ...(map || {}) };
  delete next[String(month)];
  return next;
}

function stripKpis(
  mk: ExcoManualKpis | undefined,
  keys: readonly (typeof IMPORT_KPI_KEYS)[number][],
): ExcoManualKpis {
  const next: ExcoManualKpis = { ...(mk || {}) };
  for (const key of keys) delete next[key];
  return next;
}

function clearExcoSourceFromOverlays(
  overlays: ExcoOverlays,
  month: number,
  sourceId: Exclude<ExcoSourceFileId, 'newReport'>,
): ExcoOverlays {
  const originalName = overlays.importedSources?.[sourceId]?.originalName;
  const importedSources = { ...(overlays.importedSources || {}) };
  delete importedSources[sourceId];

  const sourceFiles = (overlays.generationMeta?.sourceFiles || []).filter(
    (name) => name !== originalName,
  );

  let next: ExcoOverlays = {
    ...overlays,
    importedSources,
    generationMeta: overlays.generationMeta
      ? {
          ...overlays.generationMeta,
          generatedAt: new Date().toISOString(),
          sourceFiles,
        }
      : overlays.generationMeta,
  };

  if (sourceId === 'componentPostedUnits') {
    next = {
      ...next,
      overtimeImportsByMonth: dropMonthKey(next.overtimeImportsByMonth, month),
      overtimeCostByDept: {},
      manualKpis: stripKpis(next.manualKpis, ['overtimeCost']),
      financeByMonth: {
        ...(next.financeByMonth || {}),
        [String(month)]: stripKpis(next.financeByMonth?.[String(month)], ['overtimeCost']),
      },
    };
  }

  if (sourceId === 'leaveBalances') {
    next = {
      ...next,
      leaveImportsByMonth: dropMonthKey(next.leaveImportsByMonth, month),
      leaveBalanceByMatricule: {},
      manualKpis: stripKpis(next.manualKpis, ['leaveCost', 'leaveBalanceAvgDays']),
      financeByMonth: {
        ...(next.financeByMonth || {}),
        [String(month)]: stripKpis(next.financeByMonth?.[String(month)], [
          'leaveCost',
          'leaveBalanceAvgDays',
        ]),
      },
    };
  }

  if (sourceId === 'engagementsTerminations') {
    next = {
      ...next,
      engagementsImportsByMonth: dropMonthKey(next.engagementsImportsByMonth, month),
    };
  }

  return next;
}

/** Upload source EXCO → parse → JSON overlays → suppression du xlsx. */
export async function POST(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const form = await request.formData();
    const year = Number(form.get('year'));
    const month = Number(form.get('month'));
    const sourceId = String(form.get('sourceId') || '') as ExcoSourceFileId;
    const file = form.get('file');

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }
    if (!SOURCE_IDS.has(sourceId)) {
      return NextResponse.json({ error: 'Type de fichier inconnu' }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);
    await saveExcoUpload({
      year,
      month,
      sourceId,
      originalName: file.name,
      buffer,
    });

    const { overlays } = await getExcoOverlays(year, month);
    const fx = overlays.generationMeta?.fxRateFcPerUsd ?? null;
    let next = { ...overlays };

    if (sourceId === 'componentPostedUnits') {
      const bundle = await readEmployeesBundle();
      const identityByMatricule = identityByMatriculeFromEmployees([
        ...(bundle.employees || []),
        ...(bundle.exits || []),
      ]);
      const snap = buildExcoOtMonthImport({
        year,
        month,
        componentBuffer: ab,
        leaveBuffer: null,
        fxRateFcPerUsd: fx,
        sourceFiles: [file.name],
        identityByMatricule,
      });
      next = {
        ...next,
        overtimeImportsByMonth: {
          ...(next.overtimeImportsByMonth || {}),
          [String(month)]: snap,
        },
        importedSources: {
          ...(next.importedSources || {}),
          componentPostedUnits: {
            importedAt: new Date().toISOString(),
            originalName: file.name,
          },
        },
        generationMeta: {
          fxRateFcPerUsd: fx,
          generatedAt: new Date().toISOString(),
          sourceFiles: [
            ...new Set([...(next.generationMeta?.sourceFiles || []), file.name]),
          ],
        },
      };
    }

    if (sourceId === 'leaveBalances') {
      const bundle = await readEmployeesBundle();
      const localisationByMatricule: Record<string, string> = {};
      for (const e of [...(bundle.employees || []), ...(bundle.exits || [])]) {
        if (e.matricule) localisationByMatricule[e.matricule] = e.localisation || '';
      }
      const leaveSnap = buildExcoLeaveMonthImport({
        year,
        month,
        leaveBuffer: ab,
        fxRateFcPerUsd: fx,
        localisationByMatricule,
        sourceFiles: [file.name],
      });
      next = {
        ...next,
        leaveImportsByMonth: {
          ...(next.leaveImportsByMonth || {}),
          [String(month)]: leaveSnap,
        },
        leaveBalanceByMatricule: {
          ...(next.leaveBalanceByMatricule || {}),
          ...leaveSnap.byMatricule,
        },
        importedSources: {
          ...(next.importedSources || {}),
          leaveBalances: {
            importedAt: new Date().toISOString(),
            originalName: file.name,
          },
        },
        generationMeta: {
          fxRateFcPerUsd: fx,
          generatedAt: new Date().toISOString(),
          sourceFiles: [
            ...new Set([...(next.generationMeta?.sourceFiles || []), file.name]),
          ],
        },
      };
    }

    if (sourceId === 'engagementsTerminations') {
      const rows = parseEngagementsTerminations(ab);
      next = {
        ...next,
        engagementsImportsByMonth: {
          ...(next.engagementsImportsByMonth || {}),
          [String(month)]: rows,
        },
        importedSources: {
          ...(next.importedSources || {}),
          engagementsTerminations: {
            importedAt: new Date().toISOString(),
            originalName: file.name,
          },
        },
        generationMeta: {
          fxRateFcPerUsd: fx,
          generatedAt: new Date().toISOString(),
          sourceFiles: [
            ...new Set([...(next.generationMeta?.sourceFiles || []), file.name]),
          ],
        },
      };
    }

    const actor = await getAuditActor();
    await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-upload',
        entityId: `${year}-${String(month).padStart(2, '0')}-${sourceId}`,
        summary: `Import EXCO ${sourceId} → JSON · ${file.name}`,
        path: '/api/exco/upload',
        method: 'POST',
      },
      () => saveExcoOverlays(year, month, next, actor?.userName),
    );

    // Ne conserver que le JSON — supprimer le xlsx
    await deleteExcoUpload(year, month, sourceId);

    const uploads = await listExcoUploads(year, month);
    return NextResponse.json({
      ok: true,
      uploads,
      sourceId,
      importedSources: next.importedSources,
      note: 'Données enregistrées en JSON ; fichier source retiré.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Annule un import EXCO (JSON overlays + fichier source restant). */
export async function DELETE(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    const sourceId = String(url.searchParams.get('sourceId') || '') as ExcoSourceFileId;

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }
    if (sourceId === 'newReport' || !SOURCE_IDS.has(sourceId)) {
      return NextResponse.json({ error: 'Type de fichier inconnu' }, { status: 400 });
    }

    const { overlays } = await getExcoOverlays(year, month);
    const next = clearExcoSourceFromOverlays(overlays, month, sourceId);
    const actor = await getAuditActor();
    const label = EXCO_SOURCE_FILES.find((f) => f.id === sourceId)?.label || sourceId;

    await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-upload',
        entityId: `${year}-${String(month).padStart(2, '0')}-${sourceId}`,
        summary: `Annulation import EXCO ${label}`,
        path: '/api/exco/upload',
        method: 'DELETE',
      },
      () => saveExcoOverlays(year, month, next, actor?.userName),
    );

    await deleteExcoUpload(year, month, sourceId);

    const uploads = await listExcoUploads(year, month);
    return NextResponse.json({
      ok: true,
      uploads,
      sourceId,
      importedSources: next.importedSources,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Annulation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
