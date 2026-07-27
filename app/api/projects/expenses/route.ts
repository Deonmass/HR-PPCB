import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { upsertExpense } from '@/lib/projects-store';
import { checkPermission } from '@/lib/require-permission';
import type { ProjectExpense } from '@/lib/project-types';

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
    const { expense, updatedProjects } = await upsertExpense({ ...body, id });
    return NextResponse.json({ expense, updatedProjects }, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
