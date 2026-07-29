import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteExpense, readProjects, upsertExpense } from '@/lib/projects-store';
import { checkPermission } from '@/lib/require-permission';
import type { ProjectExpense } from '@/lib/project-types';
import { withAudit } from '@/lib/with-audit';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const denied = await checkPermission('project.expenses', 'edit');
  if (denied) return denied;
  try {
    const { id } = await params;
    const data = await readProjects();
    const existing = data.expenses.find((e) => e.id === id);
    if (!existing) {
      return NextResponse.json({ error: 'Dépense introuvable' }, { status: 404 });
    }
    const body = (await request.json()) as ProjectExpense;
    const result = await withAudit(
      {
        module: 'projects.expenses',
        action: 'update',
        entityType: 'project.expense',
        entityId: id,
        summary: `Modification dépense ${id}`,
        getBefore: async () => existing,
        getAfter: (r) => (r as { expense: ProjectExpense }).expense,
        path: `/api/projects/expenses/${id}`,
        method: 'PUT',
      },
      () => upsertExpense({ ...existing, ...body, id }),
    );
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkPermission('project.expenses', 'delete');
  if (denied) return denied;
  try {
    const { id } = await params;
    const data = await readProjects();
    const existing = data.expenses.find((e) => e.id === id);
    const result = await withAudit(
      {
        module: 'projects.expenses',
        action: 'delete',
        entityType: 'project.expense',
        entityId: id,
        summary: `Suppression dépense ${id}`,
        getBefore: async () => existing,
        getAfter: () => null,
        path: `/api/projects/expenses/${id}`,
        method: 'DELETE',
      },
      () => deleteExpense(id),
    );
    if (!result) {
      return NextResponse.json({ error: 'Dépense introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updatedProjects: result.updatedProjects });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
