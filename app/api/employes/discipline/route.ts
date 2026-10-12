import { NextResponse } from 'next/server';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import type { PpcDisciplineAgent, PpcDisciplineCaseInput } from '@/lib/ppc-discipline-types';
import {
  appliquerSanctionPpc,
  commenterPpcDisciplineCase,
  createPpcDisciplineCase,
  deletePpcDisciplineCase,
  enregistrerActionsPpc,
  enregistrerReponseAgent,
  envoyerDemandeExplication,
  getPpcDisciplineCase,
  listPpcDisciplineCases,
  updatePpcDisciplineCase,
} from '@/lib/ppc-discipline-store';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'employes.discipline';

async function listAgents(): Promise<PpcDisciplineAgent[]> {
  const { employees, exits } = await readEmployeesBundle();
  const actives: PpcDisciplineAgent[] = employees
    .filter((e) => e.matricule?.trim() && e.nom?.trim())
    .map((e) => ({
      matricule: e.matricule.trim(),
      nom: e.nom.trim(),
      departement: e.departement || '',
      jobTitle: e.jobTitle || '',
      parti: false,
    }));
  const gone: PpcDisciplineAgent[] = exits
    .filter((e) => e.matricule?.trim() && e.nom?.trim())
    .map((e) => ({
      matricule: e.matricule.trim(),
      nom: e.nom.trim(),
      departement: e.departement || '',
      jobTitle: e.jobTitle || '',
      parti: true,
    }));
  const seen = new Set(actives.map((a) => a.matricule));
  const merged = [...actives, ...gone.filter((a) => !seen.has(a.matricule))];
  merged.sort((a, b) => Number(a.parti) - Number(b.parti) || a.nom.localeCompare(b.nom, 'fr'));
  return merged;
}

function withParti<T extends { matricule: string; parti: boolean }>(
  cases: T[],
  exits: Set<string>,
): T[] {
  return cases.map((item) => ({ ...item, parti: exits.has(item.matricule) }));
}

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const matricule = url.searchParams.get('matricule')?.trim();
    const [cases, agents, bundle] = await Promise.all([
      listPpcDisciplineCases({ matricule }),
      listAgents(),
      readEmployeesBundle(),
    ]);
    const exits = new Set(bundle.exits.map((e) => e.matricule));
    return NextResponse.json({ cases: withParti(cases, exits), agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'create' },
    { menuId: MENU, action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as PpcDisciplineCaseInput;
    const session = await getActiveSession();
    const saved = await withAudit(
      {
        module: 'employes.discipline',
        action: 'create',
        entityType: 'ppc-discipline',
        entityId: body.employeeName || body.matricule,
        summary: `Cas disciplinaire PPC — ${body.employeeName || body.matricule}`,
        path: '/api/employes/discipline',
        method: 'POST',
        defer: true,
      },
      () => createPpcDisciplineCase(body, session?.user.displayName),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|vide|invalide|clos/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const denied = await checkAnyPermission([{ menuId: MENU, action: 'edit' }]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      action?: 'update' | 'demande' | 'reponse' | 'sanction' | 'commentaire' | 'actions';
      dateIncident?: string;
      motif?: string;
      faits?: string;
      statut?: PpcDisciplineCaseInput['statut'];
      sanction?: string;
      demandeDate?: string;
      demandeLien?: string;
      demandeEcheance?: string;
      reponseDate?: string;
      reponseLien?: string;
      dateSanction?: string;
      texte?: string;
    };
    if (!body.id?.trim()) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }
    const existing = await getPpcDisciplineCase(body.id);
    if (!existing) {
      return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });
    }
    const session = await getActiveSession();
    const auteur = session?.user.displayName || '—';
    const action = body.action || 'update';

    const saved = await withAudit(
      {
        module: 'employes.discipline',
        action: 'update',
        entityType: 'ppc-discipline',
        entityId: body.id,
        summary: `MAJ cas disciplinaire PPC — ${existing.employeeName}`,
        path: '/api/employes/discipline',
        method: 'PUT',
        defer: true,
      },
      async () => {
        if (action === 'actions') {
          return enregistrerActionsPpc(body.id!, {
            demandeDate: body.demandeDate,
            demandeLien: body.demandeLien,
            demandeEcheance: body.demandeEcheance,
            reponseDate: body.reponseDate,
            reponseLien: body.reponseLien,
            sanction: body.sanction,
            dateSanction: body.dateSanction,
            texte: body.texte,
          }, auteur);
        }
        if (action === 'demande') {
          return envoyerDemandeExplication(body.id!, {
            demandeDate: body.demandeDate,
            demandeLien: body.demandeLien || '',
            demandeEcheance: body.demandeEcheance,
          }, auteur);
        }
        if (action === 'reponse') {
          return enregistrerReponseAgent(body.id!, {
            reponseDate: body.reponseDate,
            reponseLien: body.reponseLien || '',
          }, auteur);
        }
        if (action === 'sanction') {
          return appliquerSanctionPpc(
            body.id!,
            { sanction: body.sanction || 'Aucune', dateSanction: body.dateSanction, texte: body.texte },
            auteur,
          );
        }
        if (action === 'commentaire') {
          return commenterPpcDisciplineCase(body.id!, auteur, body.texte || '');
        }
        return updatePpcDisciplineCase(body.id!, body, auteur);
      },
    );
    if (!saved) return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|vide|invalide|clos/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([{ menuId: MENU, action: 'delete' }]);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    const existing = await getPpcDisciplineCase(id);
    if (!existing) return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });

    const removed = await withAudit(
      {
        module: 'employes.discipline',
        action: 'delete',
        entityType: 'ppc-discipline',
        entityId: id,
        summary: `Suppression cas disciplinaire PPC — ${existing.employeeName}`,
        path: '/api/employes/discipline',
        method: 'DELETE',
        defer: true,
      },
      () => deletePpcDisciplineCase(id),
    );
    if (!removed) return NextResponse.json({ error: 'Cas introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
