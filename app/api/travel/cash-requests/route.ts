import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { createTravelDocuments, listCashRequests } from '@/lib/cash-request-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { TravelFormFields } from '@/lib/travel-form';
import type { CashRequestLine, CashRequestRecord } from '@/lib/travel-types';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkPermission('travel.historique', 'view');
  if (denied) return denied;
  try {
    const items = await listCashRequests();
    return NextResponse.json(items);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'create' },
    { menuId: 'travel.etablir', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      employeeMatricule?: string;
      employeeName?: string;
      employeeDepartment?: string;
      travel?: TravelFormFields;
      lines?: CashRequestLine[];
      saveDirectory?: string;
    };

    if (!body.travel) {
      return NextResponse.json({ error: 'Données voyage requises' }, { status: 400 });
    }

    const record = await withAudit(
      {
        module: 'travel.etablir',
        action: 'create',
        entityType: 'travel.cash-request',
        entityId: (result) => (result as CashRequestRecord)?.id,
        summary: (result) => {
          const r = result as CashRequestRecord;
          return `Création documents voyage ${r.missionRef || r.id}`;
        },
        details: (_r, _b, after) => {
          const r = after as CashRequestRecord | undefined;
          return `Documents créés pour ${r?.employeeName || body.employeeName || '—'} (${r?.missionRef || '—'})`;
        },
        undoable: false,
        path: '/api/travel/cash-requests',
        method: 'POST',
      },
      () =>
        createTravelDocuments({
          employeeMatricule: body.employeeMatricule ?? '',
          employeeName: body.employeeName ?? '',
          employeeDepartment: body.employeeDepartment ?? '',
          travel: body.travel!,
          lines: body.lines ?? [],
          saveDirectory: body.saveDirectory,
        }),
    );

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status =
      message.includes('requis') || message.includes('requise') || message.includes('Ajoutez') || message.includes('Maximum')
        ? 400
        : excelErrorResponse(err).status;
    return NextResponse.json({ error: message }, { status });
  }
}
