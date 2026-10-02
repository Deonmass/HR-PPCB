'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  computeContractantPayrollLine,
  payrollFormulaTooltip,
  sumPayrollField,
  type ContractantPayrollLineResult,
  type ContractantPayrollSite,
} from '@/lib/contractant-paie-calc';
import { closeSwal, showActionLoading, showError, showSuccess } from '@/lib/swal';

const MENU = 'employes.contractants';

type DraftRow = {
  employeeId: string;
  jrsPrestes: number;
  jrsFeries: number;
  jrsConges: number;
  jrsMaladies: number;
  jrsFeriesDim: number;
  txJr: number;
  coutTrs: number;
  avances: number;
  mb: number;
  provPpe: number;
  provMed: number;
  ot130: number;
  ot160: number;
  ot200: number;
  ot10: number;
  ot25: number;
  dependants: number;
};

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

function currentPeriod() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function usd(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numInput(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toDraft(line: ContractantPayrollLineResult): DraftRow {
  return {
    employeeId: line.employeeId,
    jrsPrestes: line.jrsPrestes,
    jrsFeries: line.jrsFeries,
    jrsConges: line.jrsConges,
    jrsMaladies: line.jrsMaladies,
    jrsFeriesDim: line.jrsFeriesDim,
    txJr: line.txJr,
    coutTrs: line.coutTrs,
    avances: line.avances,
    mb: line.mb,
    provPpe: line.provPpe,
    provMed: line.provMed,
    ot130: line.ot130,
    ot160: line.ot160,
    ot200: line.ot200,
    ot10: line.ot10,
    ot25: line.ot25,
    dependants: line.dependants,
  };
}

export default function ContractantPaiePage() {
  const { can } = usePermissions();
  const canEdit = can(MENU, 'edit');
  const canExport = can(MENU, 'export') || canEdit;

  const initial = currentPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [site, setSite] = useState<ContractantPayrollSite>('site');
  const [fxRate, setFxRate] = useState(2300);
  const [contractantNom, setContractantNom] = useState('Capital HR');
  const [lines, setLines] = useState<ContractantPayrollLineResult[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch(
          `/api/employes/contractants/paie?year=${year}&month=${month}&site=${site}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await showError(data?.error || 'Chargement impossible');
          setLines([]);
          setDrafts({});
          return;
        }
        setContractantNom(data.contractantNom || 'Capital HR');
        setFxRate(Number(data.fxRate) || 2300);
        const list = Array.isArray(data.lines) ? (data.lines as ContractantPayrollLineResult[]) : [];
        setLines(list);
        const next: Record<string, DraftRow> = {};
        for (const line of list) next[line.employeeId] = toDraft(line);
        setDrafts(next);
      } catch (err) {
        await showError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [year, month, site],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const computed = useMemo(
    () =>
      lines.map((line) => {
        const d = drafts[line.employeeId];
        if (!d) return line;
        return computeContractantPayrollLine({ ...line, ...d }, fxRate);
      }),
    [lines, drafts, fxRate],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return computed;
    return computed.filter(
      (l) =>
        l.nom.toLowerCase().includes(q)
        || l.matricule.toLowerCase().includes(q)
        || l.fonction.toLowerCase().includes(q),
    );
  }, [computed, search]);

  const kpis = useMemo(
    () => ({
      effectif: computed.length,
      brut: sumPayrollField(computed, 'brutImpos'),
      net: sumPayrollField(computed, 'netAPayer'),
      patronal: sumPayrollField(computed, 'totalPatronal'),
      total: sumPayrollField(computed, 'totalGeneral'),
    }),
    [computed],
  );

  const patchDraft = (employeeId: string, key: keyof DraftRow, value: number) => {
    setDrafts((prev) => {
      const cur = prev[employeeId];
      if (!cur) return prev;
      return { ...prev, [employeeId]: { ...cur, [key]: value } };
    });
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    showActionLoading('Enregistrement…', 'Sauvegarde de la paie');
    try {
      const res = await fetch('/api/employes/contractants/paie', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, site, fxRate, rows: Object.values(drafts) }),
      });
      const data = await res.json().catch(() => ({}));
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess('Paie enregistrée');
      await load(true);
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    if (!canExport) return;
    showActionLoading('Export…', 'Génération du fichier Excel');
    try {
      if (canEdit) {
        await fetch('/api/employes/contractants/paie', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month, site, fxRate, rows: Object.values(drafts) }),
        });
      }
      const res = await fetch(
        `/api/employes/contractants/paie?year=${year}&month=${month}&site=${site}&export=1`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        closeSwal();
        await showError(data?.error || 'Export impossible');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      const filename =
        match?.[1]
        || `PAIE_CAPITAL_HR_${site === 'site' ? 'SITE' : 'HORS_SITE'}_${year}-${String(month).padStart(2, '0')}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      closeSwal();
      await showSuccess('Export Excel téléchargé');
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Export impossible');
    }
  };

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="contractants-page contractant-paie-page">
        <div className="contractants-sticky">
          <div className="page-header page-header-with-tabs contractants-header">
            <div>
              <div className="page-header-title-row">
                <h2>Paie</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>Capital HR{contractantNom && contractantNom !== 'Capital HR' ? ` · ${contractantNom}` : ''}</p>
            </div>
            <div className="contractants-header-actions">
              <select
                className="filter-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                title="Année"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                title="Mois"
              >
                {MONTHS_FR.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="contractant-paie-fx">
                FX
                <input
                  type="number"
                  min={1}
                  value={fxRate}
                  onChange={(e) => setFxRate(numInput(e.target.value))}
                  disabled={!canEdit}
                />
              </label>
              <div className="tabs header-tabs header-tabs-compact contractants-tabs">
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${site === 'site' ? ' active' : ''}`}
                  onClick={() => setSite('site')}
                >
                  Site
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${site === 'hors-site' ? ' active' : ''}`}
                  onClick={() => setSite('hors-site')}
                >
                  Hors site
                </button>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={saving || loading}
                  onClick={() => void save()}
                >
                  Enregistrer
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={loading}
                  onClick={() => void exportExcel()}
                >
                  Exporter Excel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="contractants-body">
          <div className="travel-history-cards mvt-kpi-strip postes-kpi-strip contractant-paie-kpis">
            <div className="card card-glow card-glow-red travel-history-card postes-kpi-card">
              <div className="card-label">Effectif</div>
              <div className="card-value">{kpis.effectif}</div>
            </div>
            <div className="card card-glow card-glow-cyan travel-history-card postes-kpi-card" title="Somme des Brut imposables">
              <div className="card-label">Brut total</div>
              <div className="card-value">{usd(kpis.brut)}</div>
            </div>
            <div className="card card-glow card-glow-green travel-history-card postes-kpi-card" title="Somme des Net à payer">
              <div className="card-label">Net total</div>
              <div className="card-value">{usd(kpis.net)}</div>
            </div>
            <div className="card card-glow card-glow-amber travel-history-card postes-kpi-card" title="Somme CNSS/P + INPP + ONEM">
              <div className="card-label">Charges patronales</div>
              <div className="card-value">{usd(kpis.patronal)}</div>
            </div>
            <div className="card card-glow card-glow-violet travel-history-card postes-kpi-card" title="Somme des Totaux généraux">
              <div className="card-label">Total général</div>
              <div className="card-value">{usd(kpis.total)}</div>
            </div>
          </div>

          <div className="panel contractants-emp-list-panel" style={{ marginTop: '0.55rem' }}>
            <div className="contractants-emp-list-toolbar contractants-toolbar-search-wide">
              <input
                type="search"
                className="search-input contractants-search-wide"
                placeholder="Rechercher nom, matricule, fonction…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="loading">Chargement...</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                {search.trim() ? 'Aucun résultat.' : 'Aucune ligne paie pour cet onglet / période.'}
              </div>
            ) : (
              <div className="table-wrap contractant-paie-table-wrap">
                <table className="data-table contractant-paie-table">
                  <thead>
                    <tr>
                      <th>Matr.</th>
                      <th>Noms</th>
                      <th>Fonction</th>
                      <th>Jrs prestés</th>
                      <th>Tx/Jr</th>
                      <th>Fériés</th>
                      <th>Congés</th>
                      <th>Maladies</th>
                      <th>Cout/Trs</th>
                      <th>Jrs fériés&dim</th>
                      <th>OT 130</th>
                      <th>OT 160</th>
                      <th>OT 200</th>
                      <th>OT 10</th>
                      <th>OT 25</th>
                      <th>Avances</th>
                      <th>Dép.</th>
                      <th>PPE</th>
                      <th>Méd.</th>
                      <th>Brut</th>
                      <th>CNSS/O</th>
                      <th>IPR</th>
                      <th>Net à payer</th>
                      <th>Total gén.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((line) => {
                      const d = drafts[line.employeeId];
                      if (!d) return null;
                      const cell = (key: keyof DraftRow, step = '0.01') => (
                        <input
                          type="number"
                          step={step}
                          min={0}
                          className="contractant-paie-input"
                          title={payrollFormulaTooltip(line, key)}
                          value={d[key]}
                          disabled={!canEdit}
                          onChange={(e) =>
                            patchDraft(line.employeeId, key, numInput(e.target.value))
                          }
                        />
                      );
                      const formulaCell = (
                        field: keyof ContractantPayrollLineResult,
                        value: number,
                        strong = false,
                      ) => (
                        <td className="is-num" title={payrollFormulaTooltip(line, field)}>
                          {strong ? <strong>{usd(value)}</strong> : usd(value)}
                        </td>
                      );
                      return (
                        <tr key={line.employeeId}>
                          <td title={line.matricule}>{line.matricule || '—'}</td>
                          <td className="contractants-col-nom">{line.nom}</td>
                          <td title={line.fonction}>{line.fonction || '—'}</td>
                          <td>{cell('jrsPrestes', '0.5')}</td>
                          <td>{cell('txJr')}</td>
                          <td>{cell('jrsFeries', '0.5')}</td>
                          <td>{cell('jrsConges', '0.5')}</td>
                          <td>{cell('jrsMaladies', '0.5')}</td>
                          <td>{cell('coutTrs')}</td>
                          <td>{cell('jrsFeriesDim', '0.5')}</td>
                          <td>{cell('ot130')}</td>
                          <td>{cell('ot160')}</td>
                          <td>{cell('ot200')}</td>
                          <td>{cell('ot10')}</td>
                          <td>{cell('ot25')}</td>
                          <td>{cell('avances')}</td>
                          <td>{cell('dependants', '1')}</td>
                          <td>{cell('provPpe')}</td>
                          <td>{cell('provMed')}</td>
                          {formulaCell('brutImpos', line.brutImpos)}
                          {formulaCell('cnssOuvrier', line.cnssOuvrier)}
                          {formulaCell('ipr', line.ipr)}
                          {formulaCell('netAPayer', line.netAPayer, true)}
                          {formulaCell('totalGeneral', line.totalGeneral)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}
