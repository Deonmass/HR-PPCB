import { NextResponse } from 'next/server';
import { isRealExitRaison } from '@/lib/employee-columns';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { patchSickLeaveBalance, readSickLeaveStore } from '@/lib/sick-leave-store';
import {
  buildSickLeaveCompareRows,
  buildSickLeaveDashboard,
  normalizeSickMatricule,
} from '@/lib/sick-leave-utils';

const VIEW = [
  { menuId: 'sante.conge-maladie', action: 'view' as const },
  { menuId: 'sante', action: 'view' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const [store, bundle] = await Promise.all([
      readSickLeaveStore(),
      readEmployeesBundle().catch(() => ({ employees: [], exits: [] })),
    ]);
    const employees = bundle.employees;
    const exited = new Set(
      [
        ...bundle.exits,
        ...employees.filter((item) => /^inact/i.test(String(item.statut || '')) || isRealExitRaison(item.raisonExit)),
      ].map((item) => normalizeSickMatricule(item.matricule)),
    );
    const rows = buildSickLeaveCompareRows(store.balances, store.attestations).map((row) => ({
      ...row,
      parti: exited.has(normalizeSickMatricule(row.matricule)),
    }));
    return NextResponse.json({
      balances: store.balances,
      attestations: store.attestations,
      rows,
      dashboard: buildSickLeaveDashboard(store.balances, store.attestations),
      years: [...new Set([
        ...store.balances.map((item) => item.year),
        ...store.attestations.map((item) => item.year),
        new Date().getFullYear(),
      ])].sort((a, b) => b - a),
      employees: employees.map((item) => ({
        matricule: item.matricule,
        nom: item.nom,
        departement: item.departement,
        localisation: item.localisation,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.conge-maladie', action: 'edit' },
    { menuId: 'sante', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const body = await request.json() as {
      key?: string;
      attestationImported?: string;
      provenance?: string;
      observations?: string;
    };
    const key = String(body.key || '').trim();
    if (!key) return NextResponse.json({ error: 'Ligne requise' }, { status: 400 });
    const saved = await patchSickLeaveBalance(key, {
      attestationImported: body.attestationImported,
      provenance: body.provenance,
      observations: body.observations,
    });
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /introuvable/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
