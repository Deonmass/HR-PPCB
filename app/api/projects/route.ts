import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { assignProjectNumero, normalizeProject } from '@/lib/projects';
import { readProjects, upsertProject } from '@/lib/projects-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { ProjectRecord } from '@/lib/project-types';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'project.projects', action: 'view' },
    { menuId: 'project.expenses', action: 'view' },
    { menuId: 'project.dashboard', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const data = await readProjects();
    return NextResponse.json(data);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission('project.projects', 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as ProjectRecord;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Nom du projet requis' }, { status: 400 });
    }
    const data = await readProjects();
    const id = body.id || `p-${Date.now()}`;
    if (data.projects.some((p) => p.id === id)) {
      return NextResponse.json({ error: 'Projet déjà existant' }, { status: 409 });
    }
    const normalized = normalizeProject(
      assignProjectNumero(
        {
          ...body,
          id,
          evolution: body.evolution ?? 0,
          commentaire: body.commentaire ?? '',
          history: Array.isArray(body.history) ? body.history : [],
        },
        data.projects,
      ),
    );
    const saved = await withAudit(
      {
        module: 'projects',
        action: 'create',
        entityType: 'project',
        entityId: id,
        summary: `Création projet ${normalized.name}`,
        path: '/api/projects',
        method: 'POST',
      },
      () => upsertProject(normalized),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
