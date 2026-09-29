import { NextResponse } from 'next/server';
import {
  addDisciplineComment,
  createDisciplineCase,
  deleteDisciplineCase,
  getDisciplineCase,
  listDisciplineCases,
  updateDisciplineCase,
} from '@/lib/contractant-discipline-store';
import type { ContractantDisciplineCaseInput } from '@/lib/contractant-discipline-types';
import {
  canAccessContractantId,
  getContractantScopeFromMenus,
} from '@/lib/contractant-scope';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    const url = new URL(request.url);
    const contractantId = url.searchParams.get('contractantId')?.trim();
    const employeeId = url.searchParams.get('employeeId')?.trim();

    if (contractantId && !canAccessContractantId(contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }

    let cases = await listDisciplineCases({ contractantId, employeeId });
    if (scope.contractantIds.length) {
      const allowed = new Set(scope.contractantIds);
      cases = cases.filter((c) => allowed.has(c.contractantId));
    }
    return NextResponse.json({ cases });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'create' },
    { menuId: 'employes.contractants', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as ContractantDisciplineCaseInput & {
      comment?: string;
    };
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    if (!canAccessContractantId(body.contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }

    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'create',
        entityType: 'contractant-discipline',
        entityId: body.employeeName || body.employeeId,
        summary: `Cas disciplinaire — ${body.employeeName || body.employeeId}`,
        path: '/api/employes/contractants/discipline',
        method: 'POST',
      },
      async () => {
        const created = await createDisciplineCase(body, session?.user.displayName);
        if (body.comment?.trim()) {
          return addDisciplineComment(
            created.id,
            session?.user.displayName || '—',
            body.comment,
          );
        }
        return created;
      },
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|vide|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<ContractantDisciplineCaseInput> & {
      id: string;
      comment?: string;
    };
    if (!body.id?.trim()) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }
    const existing = await getDisciplineCase(body.id);
    if (!existing) {
      return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });
    }
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    if (!canAccessContractantId(existing.contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }

    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'update',
        entityType: 'contractant-discipline',
        entityId: body.id,
        summary: `MAJ cas disciplinaire — ${existing.employeeName}`,
        path: '/api/employes/contractants/discipline',
        method: 'PUT',
      },
      async () => {
        let updated = await updateDisciplineCase(body.id, body);
        if (body.comment?.trim() && updated) {
          updated = await addDisciplineComment(
            body.id,
            session?.user.displayName || '—',
            body.comment,
          );
        }
        return updated;
      },
    );
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|vide|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    const existing = await getDisciplineCase(id);
    if (!existing) return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    if (!canAccessContractantId(existing.contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }
    await withAudit(
      {
        module: 'contractants',
        action: 'delete',
        entityType: 'contractant-discipline',
        entityId: id,
        summary: `Suppression cas disciplinaire — ${existing.employeeName}`,
        path: '/api/employes/contractants/discipline',
        method: 'DELETE',
      },
      () => deleteDisciplineCase(id),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
