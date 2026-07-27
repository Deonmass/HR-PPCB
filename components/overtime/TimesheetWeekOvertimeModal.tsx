'use client';

import { useCallback, useEffect, useState } from 'react';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import type { WeeklyOvertimeEntry } from '@/lib/timesheet-weekly-ot';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

interface Props {
  open: boolean;
  weekIndex: number;
  weekLabel: string;
  department: string;
  agents: Employee[];
  periodYear: number;
  periodMonth: number;
  canEdit?: boolean;
  onConfirmWeek?: () => void | Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}

function emptyRow(matricule: string): WeeklyOvertimeEntry {
  return { matricule, ot13: 0, ot16: 0, ot2: 0, night: 0 };
}

function parseInput(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function TimesheetWeekOvertimeModal({
  open,
  weekIndex,
  weekLabel,
  department,
  agents,
  periodYear,
  periodMonth,
  canEdit = false,
  onConfirmWeek,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<WeeklyOvertimeEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState<'with' | 'without'>('with');

  const loadWeek = useCallback(async () => {
    if (!open || !department) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(periodYear),
        month: String(periodMonth),
        department,
        weekIndex: String(weekIndex),
      });
      const res = await fetch(`/api/timesheet/weekly-ot?${params}`);
      const json = (await res.json()) as {
        week?: { locked?: boolean; entries?: WeeklyOvertimeEntry[] };
      };
      const entries = json.week?.entries ?? [];
      const byMatricule = new Map(entries.map((entry) => [entry.matricule, entry]));
      setRows(agents.map((agent) => byMatricule.get(agent.matricule) ?? emptyRow(agent.matricule)));
      setLocked(Boolean(json.week?.locked));
    } catch {
      setRows(agents.map((agent) => emptyRow(agent.matricule)));
      setLocked(false);
    } finally {
      setLoading(false);
    }
  }, [agents, department, open, periodMonth, periodYear, weekIndex]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const rowHasData = (row: WeeklyOvertimeEntry) =>
    row.ot13 > 0 || row.ot16 > 0 || row.ot2 > 0 || row.night > 0;

  useEffect(() => {
    setActiveTab(rows.some(rowHasData) ? 'with' : 'without');
  }, [rows]);

  const updateCell = (matricule: string, field: keyof Omit<WeeklyOvertimeEntry, 'matricule'>, value: string) => {
    if (!canEdit || locked) return;
    setRows((prev) =>
      prev.map((row) =>
        row.matricule === matricule ? { ...row, [field]: parseInput(value) } : row,
      ),
    );
  };

  const handleSave = async () => {
    if (!canEdit || locked) return;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheet/weekly-ot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: periodYear,
          month: periodMonth,
          department,
          weekIndex,
          entries: rows,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Enregistrement impossible');
      }
      await showSuccess('Heures sup. de la semaine enregistrées');
      onSaved();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!canEdit || locked) return;
    const confirmed = await confirmAction(
      'Confirmer les overtimes ?',
      'Après confirmation, les heures sup. de la semaine seront verrouillées.',
      'Confirmer',
    );
    if (!confirmed) return;
    setConfirming(true);
    try {
      if (onConfirmWeek) {
        await onConfirmWeek();
      } else {
        const res = await fetch('/api/timesheet/weekly-ot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm',
            year: periodYear,
            month: periodMonth,
            department,
            weekIndex,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? 'Confirmation impossible');
        }
        await showSuccess('Overtimes confirmés et verrouillés');
      }
      setLocked(true);
      onSaved();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Confirmation impossible');
    } finally {
      setConfirming(false);
    }
  };

  const rowsWithData = rows.filter(rowHasData);
  const rowsWithoutData = rows.filter((row) => !rowHasData(row));
  const displayedRows = activeTab === 'with' ? rowsWithData : rowsWithoutData;

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-week-ot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Overtime — {weekLabel}</h3>
            <p className="timesheet-manager-modal-subtitle">
              {department} · Vérifiez et éditez les heures sup. importées
              {locked ? ' · Verrouillé (confirmé ou mois clôturé)' : ' · À confirmer après validation'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body timesheet-manager-modal-body">
          <div className="timesheet-week-ot-tabs">
            <button
              type="button"
              className={`timesheet-week-ot-tab${activeTab === 'with' ? ' active' : ''}`}
              onClick={() => setActiveTab('with')}
            >
              Avec données ({rowsWithData.length})
            </button>
            <button
              type="button"
              className={`timesheet-week-ot-tab${activeTab === 'without' ? ' active' : ''}`}
              onClick={() => setActiveTab('without')}
            >
              Sans données ({rowsWithoutData.length})
            </button>
          </div>
          <div className="table-wrap timesheet-manager-table-wrap">
            <table className="timesheet-table timesheet-week-ot-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Mat.</th>
                  <th>1.3</th>
                  <th>1.6</th>
                  <th>2</th>
                  <th>Night</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="timesheet-manager-loading">
                      Chargement…
                    </td>
                  </tr>
                ) : displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="timesheet-manager-loading">
                      Aucun agent dans cette catégorie
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const agent = agents.find((item) => item.matricule === row.matricule);
                    return (
                      <tr key={row.matricule}>
                        <td className="timesheet-manager-agent-cell">{agent?.nom ?? row.matricule}</td>
                        <td>{row.matricule}</td>
                        {(['ot13', 'ot16', 'ot2', 'night'] as const).map((field) => (
                          <td key={field}>
                            {canEdit && !locked ? (
                              <input
                                type="number"
                                step="0.01"
                                className="timesheet-week-ot-input"
                                value={row[field] || ''}
                                onChange={(e) => updateCell(row.matricule, field, e.target.value)}
                              />
                            ) : (
                              row[field] ? row[field].toFixed(2) : ''
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
          {canEdit && !locked ? (
            <button type="button" className="btn btn-accent" onClick={handleSave} disabled={saving || loading || confirming}>
              {saving ? <BtnSpinner /> : null}
              Enregistrer
            </button>
          ) : null}
          {canEdit && !locked ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleConfirm()}
              disabled={saving || loading || confirming}
            >
              {confirming ? <BtnSpinner /> : null}
              Confirmer
            </button>
          ) : null}
          {locked ? (
            <button type="button" className="btn btn-primary" disabled>
              Confirmé — verrouillé
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
