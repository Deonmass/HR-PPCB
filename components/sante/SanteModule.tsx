'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import SanteDashboardView from '@/components/sante/SanteDashboardView';
import SanteDataView from '@/components/sante/SanteDataView';
import SanteHistoryModal from '@/components/sante/SanteHistoryModal';
import SanteVisitModal from '@/components/sante/SanteVisitModal';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  SANTE_MONTH_NAMES,
  buildSanteDashboard,
  buildSanteHistory,
  emptySanteVisitInput,
  filterSanteVisits,
  santePersonKey,
  visitToInput,
} from '@/lib/sante-utils';
import type {
  SanteDependantLite,
  SanteEmployeeLite,
  SantePersonHistory,
  SanteVisit,
  SanteVisitInput,
} from '@/lib/sante-types';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

interface Payload {
  visits: SanteVisit[];
  years: number[];
  types: string[];
  pathologies: string[];
  traitements: string[];
  references: string[];
  employees: SanteEmployeeLite[];
  dependants: SanteDependantLite[];
}

interface Props {
  view: 'dashboard' | 'donnees';
}

const VIEW_ANY = [
  { menuId: 'sante.dashboard', action: 'view' as const },
  { menuId: 'sante.donnees', action: 'view' as const },
  { menuId: 'sante', action: 'view' as const },
];

export default function SanteModule({ view }: Props) {
  const { can } = usePermissions();
  const canCreate = can('sante.donnees', 'create') || can('sante', 'create');
  const canEdit = can('sante.donnees', 'edit') || can('sante', 'edit');
  const canDelete = can('sante.donnees', 'delete') || can('sante', 'delete');
  const canExport =
    can('sante.donnees', 'export')
    || can('sante.dashboard', 'export')
    || can('sante', 'export');

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const now = new Date();
  const [year, setYear] = useState<number | ''>(now.getFullYear());
  const [month, setMonth] = useState<number | ''>(now.getMonth() + 1);
  const [typeMalade, setTypeMalade] = useState('');
  const [reference, setReference] = useState('');
  const [pathologie, setPathologie] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<SanteVisitInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<SantePersonHistory | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/sante');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Chargement impossible');
        return;
      }
      setPayload({
        visits: json.visits || [],
        years: json.years || [],
        types: json.types || [],
        pathologies: json.pathologies || [],
        traitements: json.traitements || [],
        references: json.references || [],
        employees: json.employees || [],
        dependants: json.dependants || [],
      });
    } catch {
      await showError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filterSanteVisits(payload?.visits || [], {
        year,
        month,
        typeMalade,
        reference,
        pathologie,
        q,
      }),
    [payload?.visits, year, month, typeMalade, reference, pathologie, q],
  );

  const dashboard = useMemo(() => buildSanteDashboard(filtered), [filtered]);

  const years = useMemo(() => {
    const set = new Set<number>(payload?.years || []);
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [payload?.years]);

  const exportFile = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch('/api/sante/export');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        await showError(json?.error || 'Export impossible');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FICHE_PATHOLOGIES_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      await showError('Erreur d’export');
    } finally {
      setExporting(false);
    }
  };

  const saveVisit = async () => {
    if (!form) return;
    if (!form.date || !form.nom.trim() || !form.pathologie.trim()) {
      await showError('Date, nom et pathologie sont requis');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/sante/${editingId}` : '/api/sante', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      setForm(null);
      setEditingId(null);
      await showSuccess(editingId ? 'Cas modifié' : 'Cas enregistré');
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const removeVisit = async (visit: SanteVisit) => {
    if (!(await confirmDelete('Supprimer ce cas ?', `${visit.nom} ${visit.postnom} — ${visit.pathologie}`))) {
      return;
    }
    try {
      const res = await fetch(`/api/sante/${visit.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Cas supprimé');
      await load(true);
    } catch {
      await showError('Erreur de suppression');
    }
  };

  const openHistory = (visit: SanteVisit) => {
    const next = buildSanteHistory(payload?.visits || [], santePersonKey(visit));
    setHistory(next);
  };

  if (loading) {
    return (
      <PermissionGate anyOf={VIEW_ANY}>
        <div className="loading">Chargement du module santé…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="mvt-page mvt-page-fill sante-page">
        <div className="page-header page-header-with-tabs mvt-page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Santé</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p className="mvt-page-sub">
              Fiche d’enregistrement journalière des pathologies
              <span className="mvt-count-pill" title={`${(payload?.visits || []).length} cas au total`}>
                {filtered.length}
                {(payload?.visits || []).length !== filtered.length
                  ? ` / ${(payload?.visits || []).length}`
                  : ''}
              </span>
            </p>
          </div>
          <div className="page-header-actions mvt-header-actions sante-header-actions">
            <select
              className="filter-select filter-select-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}
              aria-label="Mois"
            >
              <option value="">Tous les mois</option>
              {SANTE_MONTH_NAMES.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="filter-select filter-select-sm"
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
              aria-label="Année"
            >
              <option value="">Toutes les années</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              className="filter-select filter-select-sm"
              value={typeMalade}
              onChange={(e) => setTypeMalade(e.target.value)}
              aria-label="Type"
            >
              <option value="">Tous les types</option>
              {(payload?.types || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="filter-select filter-select-sm"
              value={pathologie}
              onChange={(e) => setPathologie(e.target.value)}
              aria-label="Pathologie"
            >
              <option value="">Toutes les pathologies</option>
              {(payload?.pathologies || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="filter-select filter-select-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              aria-label="Référence"
            >
              <option value="">Toutes les références</option>
              <option value="__ref__">Référés</option>
              <option value="__none__">Non référés</option>
              {(payload?.references || [])
                .filter((item) => item.toUpperCase() !== 'NON')
                .map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
            </select>
            {canCreate ? (
              <button
                type="button"
                className="btn btn-sm sante-btn-add"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptySanteVisitInput());
                }}
              >
                Ajouter
              </button>
            ) : null}
            {canExport ? (
              <button
                type="button"
                className="btn btn-sm btn-with-icon sante-btn-export"
                onClick={() => void exportFile()}
                disabled={exporting}
              >
                {exporting ? <BtnSpinner /> : null}
                {exporting ? 'Export…' : 'Exporter Excel'}
              </button>
            ) : null}
          </div>
        </div>

        {view === 'donnees' ? (
          <div className="sante-search-bar">
            <input
              type="search"
              className="search-input"
              placeholder="Rechercher nom, matricule, pathologie…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        ) : null}

        {view === 'dashboard' ? (
          <SanteDashboardView dashboard={dashboard} visits={filtered} />
        ) : (
          <SanteDataView
            visits={filtered}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={(visit) => {
              setEditingId(visit.id);
              setForm(visitToInput(visit));
            }}
            onHistory={openHistory}
            onDelete={(visit) => void removeVisit(visit)}
          />
        )}

        {form ? (
          <SanteVisitModal
            open
            title={editingId ? 'Modifier un cas' : 'Nouveau cas'}
            value={form}
            employees={payload?.employees || []}
            dependants={payload?.dependants || []}
            pathologies={payload?.pathologies || []}
            traitements={payload?.traitements || []}
            references={payload?.references || []}
            saving={saving}
            onChange={setForm}
            onClose={() => {
              setForm(null);
              setEditingId(null);
            }}
            onSubmit={() => void saveVisit()}
          />
        ) : null}

        <SanteHistoryModal history={history} onClose={() => setHistory(null)} />
      </div>
    </PermissionGate>
  );
}
