import { NextResponse } from 'next/server';
import { EXCO_SOURCE_FILES, type ExcoSourceFileId } from '@/lib/exco-source-files';
import { deleteExcoUpload, listExcoUploads, saveExcoUpload } from '@/lib/exco-uploads';
import { getExcoOverlays, saveExcoOverlays } from '@/lib/exco-store';
import {
  buildExcoLeaveMonthImport,
  buildExcoOtMonthImport,
} from '@/lib/exco-ot-import';
import { parseEngagementsTerminations } from '@/lib/exco-engagements-parse';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

const SOURCE_IDS = new Set(EXCO_SOURCE_FILES.map((f) => f.id));

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
      const snap = buildExcoOtMonthImport({
        year,
        month,
        componentBuffer: ab,
        leaveBuffer: null,
        fxRateFcPerUsd: fx,
        sourceFiles: [file.name],
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
