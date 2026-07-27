'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TimesheetPeriodDay } from '@/lib/timesheet-period';
import type { TimesheetDayEntry, TimesheetShiftType } from '@/lib/timesheet-types';
import { TIMESHEET_SHIFT_OPTIONS } from '@/lib/timesheet-types';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';

interface AgentRow {
  matricule: string;
  nom: string;
  shiftType: TimesheetShiftType | null;
}

interface Props {
  open: boolean;
  day: TimesheetPeriodDay;
  department: string;
  agents: Employee[];
  periodYear: number;
  periodMonth: number;
  canEdit?: boolean;
  locked?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function buildRows(agents: Employee[], saved: Record<string, TimesheetDayEntry>): AgentRow[] {
  return agents.map((employee) => ({
    matricule: employee.matricule,
    nom: employee.nom,
    shiftType: saved[employee.matricule]?.shiftType ?? null,
  }));
}

function shiftLabel(shiftType: TimesheetShiftType | null): string {
  if (!shiftType) return '—';
  return TIMESHEET_SHIFT_OPTIONS.find((option) => option.id === shiftType)?.planningLabel ?? shiftType;
}

export default function TimesheetPlanningDayModal({
  open,
  day,
  department,
  agents,
  periodYear,
  periodMonth,
  canEdit = false,
  locked = false,
  readOnly = false,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isReadOnly = readOnly || locked || !canEdit;

  const loadDay = useCallback(async () => {
    if (!open || !department) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(periodYear),
        month: String(periodMonth),
        dateKey: day.dateKey,
        department,
      });
      const res = await fetch(`/api/timesheet/entries?${params}`);
      const json = (await res.json()) as { entries?: Record<string, TimesheetDayEntry> };
      setRows(buildRows(agents, json.entries ?? {}));
    } catch {
      setRows(buildRows(agents, {}));
    } finally {
      setLoading(false);
    }
  }, [agents, day.dateKey, department, open, periodMonth, periodYear]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const handleSave = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheet/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'planning',
          year: periodYear,
          month: periodMonth,
          dateKey: day.dateKey,
          department,
          entries: rows.map((row) => ({
            matricule: row.matricule,
            from: '',
            to: '',
            shiftType: row.shiftType,
          })),
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Enregistrement impossible');
      }
      await showSuccess('Planning enregistré pour la journée');
      onSaved();
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const plannedCount = rows.filter((row) => row.shiftType !== null).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{readOnly ? 'Détail planning' : 'Planning'} — {department}</h3>
            <p className="timesheet-manager-modal-subtitle">
              {day.date.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {plannedCount}/{rows.length} agent(s) planifié(s)
              {readOnly ? ' · Lecture seule' : ''}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body timesheet-manager-modal-body">
          <div className="table-wrap timesheet-manager-table-wrap">
            <table className="timesheet-table timesheet-manager-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Mat.</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="timesheet-manager-loading">
                      Chargement…
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.matricule} className={row.shiftType ? 'timesheet-manager-planned-row' : ''}>
                      <td className="timesheet-manager-agent-cell">{row.nom}</td>
                      <td>{row.matricule}</td>
                      <td className="timesheet-planning-shift-readonly">{shiftLabel(row.shiftType)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
          {!isReadOnly ? (
            <button type="button" className="btn btn-accent btn-with-icon" onClick={handleSave} disabled={saving || loading}>
              {saving ? <BtnSpinner /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer le planning'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
