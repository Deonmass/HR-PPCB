import { NextResponse } from 'next/server';
import type { CompilationData } from '@/lib/timesheet-compilation';
import { buildCompilationWorkbookBuffer } from '@/lib/timesheet-compilation-export.server';
import type { PolicyChange } from '@/lib/timesheet-compilation-policy';
import { checkTimesheetDepartmentExport } from '@/lib/timesheet-access-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Export Excel d'une compilation en mémoire (simulation) via template OVERTIMES.xlsx. */
export async function POST(request: Request) {
  const denied = await checkTimesheetDepartmentExport();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      data?: CompilationData;
      /** Lignes politiques (avec annulations éventuelles). */
      policyRows?: CompilationData['rows'];
      /** @deprecated utiliser policyRows */
      rows?: CompilationData['rows'];
      policyChanges?: PolicyChange[];
    };
    if (!body.data?.weeks?.length) {
      return NextResponse.json({ error: 'Données de compilation invalides' }, { status: 400 });
    }
    if (!body.data.rows?.length) {
      return NextResponse.json({ error: 'Aucune ligne à exporter' }, { status: 400 });
    }

    const policyRows = body.policyRows ?? body.rows;
    const buffer = await buildCompilationWorkbookBuffer(body.data, {
      policyRows,
      policyChanges: body.policyChanges,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Compilation-OT-simulation.xlsx"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export impossible' },
      { status: 500 },
    );
  }
}
