import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  assignFactureStep,
  bulkUpdateFacturePayment,
  deleteFactureSuivi,
  deleteFacturesSuiviMany,
  getFactureSuivi,
  getFacturesSuiviBundle,
  upsertFactureSuivi,
  upsertFacturesBatch,
} from '@/lib/factures-fournisseurs/store';
import type {
  AssignStepPayload,
  FactureBatchLineInput,
  FactureSuiviInput,
} from '@/lib/factures-fournisseurs/types';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'factures.fournisseur.factures';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'factures.fournisseur.soa', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const data = await getFacturesSuiviBundle();
    return NextResponse.json(data);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FactureSuiviInput & {
      action?: string;
      lines?: FactureBatchLineInput[];
    };
    if (body.action === 'assign') {
      const assignDenied = await checkPermission(MENU, 'edit');
      if (assignDenied) return assignDenied;
      const payload = body as unknown as AssignStepPayload;
      const updated = await withAudit(
        {
          module: 'factures-suivi',
          action: 'update',
          entityType: 'facture.suivi',
          undoable: false,
          summary: `Assignation étape factures (${payload.ids?.length || 0})`,
          details: `Étape ${payload.step} — numéros: ${(payload.ids || []).join(', ')}`,
          path: '/api/factures-suivi',
          method: 'POST',
        },
        () => assignFactureStep(payload),
      );
      return NextResponse.json({ updated });
    }
    if (body.action === 'bulk-payment') {
      const editDenied = await checkPermission(MENU, 'edit');
      if (editDenied) return editDenied;
      const ids = Array.isArray((body as { ids?: unknown }).ids)
        ? ((body as { ids: unknown[] }).ids as unknown[]).map(String)
        : [];
      const statusRaw = String((body as { status?: unknown }).status ?? '').toLowerCase();
      const status = statusRaw === 'paid' ? 'paid' : 'unpaid';
      const datePym = String((body as { datePym?: unknown }).datePym ?? '');
      const updated = await withAudit(
        {
          module: 'factures-suivi',
          action: 'update',
          entityType: 'facture.suivi',
          undoable: false,
          summary: `Statut ${status} — ${ids.length} facture(s)`,
          details: `IDs: ${ids.join(', ')}`,
          path: '/api/factures-suivi',
          method: 'POST',
        },
        () => bulkUpdateFacturePayment({ ids, status, datePym }),
      );
      return NextResponse.json({ updated });
    }
    if (body.action === 'bulk-delete') {
      const deleteDenied = await checkPermission(MENU, 'delete');
      if (deleteDenied) return deleteDenied;
      const ids = Array.isArray((body as { ids?: unknown }).ids)
        ? ((body as { ids: unknown[] }).ids as unknown[]).map(String)
        : [];
      const deleted = await withAudit(
        {
          module: 'factures-suivi',
          action: 'delete',
          entityType: 'facture.suivi',
          undoable: false,
          summary: `Suppression groupée — ${ids.length} facture(s)`,
          details: `IDs: ${ids.join(', ')}`,
          path: '/api/factures-suivi',
          method: 'POST',
        },
        () => deleteFacturesSuiviMany(ids),
      );
      return NextResponse.json({ deleted });
    }
    if (body.action === 'batch') {
      const denied = await checkPermission(MENU, 'create');
      if (denied) return denied;
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const created = await withAudit(
        {
          module: 'factures-suivi',
          action: 'create',
          undoable: false,
          summary: `Création lot de ${lines.length} facture(s)`,
          path: '/api/factures-suivi',
          method: 'POST',
        },
        () => upsertFacturesBatch(lines),
      );
      return NextResponse.json({ created }, { status: 201 });
    }
    const denied = await checkPermission(MENU, 'create');
    if (denied) return denied;
    const item = await withAudit(
      {
        module: 'factures-suivi',
        action: 'create',
        entityType: 'facture.suivi',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const f = result as { facture?: string; societe?: string; id?: string };
          return `Création facture ${f.facture || f.id} — ${f.societe || ''}`;
        },
        path: '/api/factures-suivi',
        method: 'POST',
      },
      () => upsertFactureSuivi(body),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const body = (await request.json()) as FactureSuiviInput;
    if (!body.id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const item = await withAudit(
      {
        module: 'factures-suivi',
        action: 'update',
        entityType: 'facture.suivi',
        entityId: body.id.trim(),
        summary: `Modification facture ${body.facture || body.id}`,
        getBefore: () => getFactureSuivi(body.id!.trim()),
        path: '/api/factures-suivi',
        method: 'PUT',
      },
      () => upsertFactureSuivi(body),
    );
    return NextResponse.json(item);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const ok = await withAudit(
      {
        module: 'factures-suivi',
        action: 'delete',
        entityType: 'facture.suivi',
        entityId: id,
        summary: `Suppression facture ${id}`,
        getBefore: () => getFactureSuivi(id),
        getAfter: () => null,
        path: '/api/factures-suivi',
        method: 'DELETE',
      },
      () => deleteFactureSuivi(id),
    );
    if (!ok) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
