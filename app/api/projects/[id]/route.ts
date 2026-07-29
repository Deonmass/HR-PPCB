import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { normalizeProject, validateBudgetPrevuVerification } from '@/lib/projects';
import { deleteProject, getProject, upsertProject } from '@/lib/projects-store';
import { checkPermission } from '@/lib/require-permission';
import type { ProjectRecord } from '@/lib/project-types';
import { withAudit } from '@/lib/with-audit';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const denied = await checkPermission('project.projects', 'edit');
  if (denied) return denied;
  try {
    const { id } = await params;
    const existing = await getProject(id);
    if (!existing) {
      return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 });
    }
    const body = (await request.json()) as ProjectRecord;
    const normalized = normalizeProject({ ...existing, ...body, id });
    const validationError = validateBudgetPrevuVerification(normalized);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const saved = await withAudit(
      {
        module: 'projects',
        action: 'update',
        entityType: 'project',
        entityId: id,
        summary: `Modification projet ${normalized.name}`,
        getBefore: async () => existing,
        path: `/api/projects/${id}`,
        method: 'PUT',
      },
      () => upsertProject(normalized),
    );
    return NextResponse.json(saved);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkPermission('project.projects', 'delete');
  if (denied) return denied;
  try {
    const { id } = await params;
    const ok = await withAudit(
      {
        module: 'projects',
        action: 'delete',
        entityType: 'project',
        entityId: id,
        summary: `Suppression projet ${id}`,
        getBefore: () => getProject(id),
        getAfter: () => null,
        path: `/api/projects/${id}`,
        method: 'DELETE',
      },
      () => deleteProject(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
