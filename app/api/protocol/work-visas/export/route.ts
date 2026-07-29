import { NextResponse } from 'next/server';
import { buildWorkVisaExportBuffer } from '@/lib/work-visa-export.server';
import { listWorkVisaDossiers } from '@/lib/work-visa-store';
import type { WorkVisaListQuery, WorkVisaReport } from '@/lib/work-visa-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.visa-travail';

function parseBool(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parseQuery(url: URL): WorkVisaListQuery {
  const report = (url.searchParams.get('report') || '') as WorkVisaReport | '';
  return {
    q: url.searchParams.get('q') || undefined,
    centreCout: url.searchParams.get('centreCout') || undefined,
    nationalite: url.searchParams.get('nationalite') || undefined,
    sexe: url.searchParams.get('sexe') || undefined,
    status: (url.searchParams.get('status') || '') as WorkVisaListQuery['status'],
    report: report || undefined,
    passportExpired: parseBool(url.searchParams.get('passportExpired')),
    workCardExpired: parseBool(url.searchParams.get('workCardExpired')),
    vsrExpired: parseBool(url.searchParams.get('vsrExpired')),
    visaExpired: parseBool(url.searchParams.get('visaExpired')),
    visaValide: parseBool(url.searchParams.get('visaValide')),
    alert4m: parseBool(url.searchParams.get('alert4m')),
  };
}

export async function GET(request: Request) {
  const denied = await checkPermission(MENU, 'export');
  if (denied) return denied;
  try {
    const query = parseQuery(new URL(request.url));
    const { dossiers } = await listWorkVisaDossiers(query);
    const buffer = await withAudit(
      {
        module: 'protocol.visa-travail',
        action: 'export',
        entityType: 'work-visa.dossier',
        summary: `Export Excel visas de travail (${dossiers.length} ligne(s))`,
        path: '/api/protocol/work-visas/export',
        method: 'GET',
      },
      async () => buildWorkVisaExportBuffer(dossiers),
    );

    const filename = `visas-travail-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
