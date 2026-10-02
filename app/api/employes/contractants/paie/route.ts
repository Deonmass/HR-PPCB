import { NextResponse } from 'next/server';
import {
  computeContractantPayrollLine,
  defaultsForSite,
  type ContractantPayrollSite,
} from '@/lib/contractant-paie-calc';
import { buildContractantPaieExcelBuffer } from '@/lib/contractant-paie-export.server';
import {
  ensureSeededPaieMonth,
  getPaieMonth,
  upsertPaieMonth,
  type ContractantPaieMonthRow,
} from '@/lib/contractant-paie-store';
import {
  canAccessContractantId,
  getContractantScopeFromMenus,
} from '@/lib/contractant-scope';
import { getContractant, listContractants } from '@/lib/contractants-store';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';

function parseSite(raw: string | null): ContractantPayrollSite {
  return raw === 'hors-site' ? 'hors-site' : 'site';
}

async function resolveCapitalHrId(preferred?: string | null): Promise<string | null> {
  if (preferred?.trim()) return preferred.trim();
  const all = await listContractants();
  const hit = all.find((c) => /capital\s*hr/i.test(c.denomination));
  return hit?.id ?? null;
}

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    const url = new URL(request.url);
    const year = Number.parseInt(url.searchParams.get('year') || '', 10);
    const month = Number.parseInt(url.searchParams.get('month') || '', 10);
    const site = parseSite(url.searchParams.get('site'));
    const exportXlsx = url.searchParams.get('export') === '1';
    const contractantId = await resolveCapitalHrId(url.searchParams.get('contractantId'));

    if (!contractantId) {
      return NextResponse.json({ error: 'Contractant Capital HR introuvable' }, { status: 404 });
    }
    if (!canAccessContractantId(contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }

    let monthData = await getPaieMonth(contractantId, year, month, site);
    if (!monthData) {
      monthData = await ensureSeededPaieMonth(contractantId, year, month, site);
    }

    const contractant = await getContractant(contractantId);
    if (!contractant) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }

    const defaults = defaultsForSite(site);
    const fxRate = monthData?.fxRate || 2300;
    const rowById = new Map((monthData?.rows || []).map((r) => [r.employeeId, r]));

    const employees = contractant.employees.filter((e) => {
      if (e.dateSortie) return false;
      if (rowById.has(e.id)) return true;
      return e.payrollSite === site;
    });

    const lines = employees.map((e) => {
      const saved = rowById.get(e.id);
      const input = {
        employeeId: e.id,
        nom: e.nom,
        matricule: e.matriculePpc || '',
        fonction: e.fonction || '',
        numeroCnss: e.numeroCnss || '',
        numeroCompte: e.numeroCompte || '',
        banque: e.banque || '',
        dependants: saved?.dependants ?? e.nbDependants ?? 0,
        jrsPrestes: saved?.jrsPrestes ?? 0,
        txJr: saved?.txJr ?? e.txJr ?? 0,
        jrsFeries: saved?.jrsFeries ?? 0,
        jrsConges: saved?.jrsConges ?? 0,
        jrsMaladies: saved?.jrsMaladies ?? 0,
        coutTrs: saved?.coutTrs ?? e.coutTransport ?? 0,
        jrsFeriesDim: saved?.jrsFeriesDim ?? 0,
        avances: saved?.avances ?? 0,
        mb: saved?.mb ?? 0,
        provPpe: saved?.provPpe ?? defaults.provPpe,
        provMed: saved?.provMed ?? defaults.provMed,
        ot130: saved?.ot130 ?? 0,
        ot160: saved?.ot160 ?? 0,
        ot200: saved?.ot200 ?? 0,
        ot10: saved?.ot10 ?? 0,
        ot25: saved?.ot25 ?? 0,
      };
      return computeContractantPayrollLine(input, fxRate);
    });

    if (exportXlsx) {
      const { buffer, filename } = await buildContractantPaieExcelBuffer({
        site,
        year,
        month,
        rows: lines,
        fxRate,
      });
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      contractantId,
      contractantNom: contractant.denomination,
      year,
      month,
      site,
      fxRate,
      lines,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    const body = (await request.json()) as {
      contractantId?: string;
      year?: number;
      month?: number;
      site?: string;
      fxRate?: number;
      rows?: ContractantPaieMonthRow[];
    };
    const contractantId = await resolveCapitalHrId(body.contractantId);
    if (!contractantId) {
      return NextResponse.json({ error: 'Contractant Capital HR introuvable' }, { status: 404 });
    }
    if (!canAccessContractantId(contractantId, scope)) {
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 });
    }
    const year = Number(body.year);
    const month = Number(body.month);
    const site = parseSite(body.site ?? null);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }

    const saved = await upsertPaieMonth({
      contractantId,
      year,
      month,
      site,
      fxRate: Number(body.fxRate) || 2300,
      rows: Array.isArray(body.rows) ? body.rows : [],
    });
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
