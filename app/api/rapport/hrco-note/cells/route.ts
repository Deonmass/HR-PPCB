import { NextResponse } from 'next/server';
import { hrcoManualKey } from '@/lib/hrco-note';
import { writeHrcoManualCells } from '@/lib/hrco-note-cells.server';
import { checkPermission } from '@/lib/require-permission';

export async function PUT(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;
  const body = await request.json().catch(() => null) as {
    tableId?: unknown;
    rowIndex?: unknown;
    colIndex?: unknown;
    value?: unknown;
    cells?: unknown;
  } | null;
  const tableId = String(body?.tableId || '').trim();
  const cells = Array.isArray(body?.cells)
    ? body.cells
    : [{ rowIndex: body?.rowIndex, colIndex: body?.colIndex, value: body?.value }];
  const entries: Array<{ key: string; value: string }> = [];
  for (const cell of cells) {
    const item = cell as { rowIndex?: unknown; colIndex?: unknown; value?: unknown };
    const rowIndex = Number(item.rowIndex);
    const colIndex = Number(item.colIndex);
    if (!tableId || !Number.isInteger(rowIndex) || rowIndex < 0 || !Number.isInteger(colIndex) || colIndex < 0) {
      return NextResponse.json({ error: 'Cellule invalide' }, { status: 400 });
    }
    entries.push({
      key: hrcoManualKey(tableId, rowIndex, colIndex),
      value: String(item.value ?? '').slice(0, 500),
    });
  }
  if (!entries.length) return NextResponse.json({ error: 'Cellule invalide' }, { status: 400 });
  const values = await writeHrcoManualCells(entries);
  return NextResponse.json({ values });
}
