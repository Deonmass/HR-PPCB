import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { upsertExpense } from '@/lib/projects-store';
import { checkPermission } from '@/lib/require-permission';
import type { ProjectExpense } from '@/lib/project-types';
import { withAudit } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkPermission('project.expenses', 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as ProjectExpense;
    if (!body.projet?.trim()) {
      return NextResponse.json({ error: 'Projet requis' }, { status: 400 });
    }
    if (!body.montant || body.montant <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }
    const id = body.id || `e-${Date.now()}`;
    const result = await withAudit(
      {
        module: 'projects.expenses',
        action: 'create',
        entityType: 'project.expense',
        entityId: id,
        summary: `Création dépense ${body.projet} — ${body.montant}`,
        getAfter: (r) => (r as { expense: ProjectExpense }).expense,
        path: '/api/projects/expenses',
        method: 'POST',
      },
      () => upsertExpense({ ...body, id }),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
