import { NextResponse } from 'next/server';
import {
  createWorkVisaDossier,
  listWorkVisaDossiers,
} from '@/lib/work-visa-store';
import type { WorkVisaDossierInput, WorkVisaListQuery, WorkVisaReport } from '@/lib/work-visa-types';
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
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  try {
    const query = parseQuery(new URL(request.url));
    const data = await listWorkVisaDossiers(query);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as WorkVisaDossierInput;
    const dossier = await withAudit(
      {
        module: 'protocol.visa-travail',
        action: 'create',
        entityType: 'work-visa.dossier',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const d = result as { matricule?: string; nom?: string };
          return `Création dossier visa ${d.matricule || ''} — ${d.nom || ''}`;
        },
        path: '/api/protocol/work-visas',
        method: 'POST',
      },
      () => createWorkVisaDossier(body),
    );
    return NextResponse.json(dossier, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de création';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
