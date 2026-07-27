'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import TimesheetShiftSelect from '@/components/overtime/TimesheetShiftSelect';
import TimesheetTimeInput from '@/components/overtime/TimesheetTimeInput';
import { formatHoursValue, recalculateRow, rowTotalHours } from '@/lib/timesheet-calc';
import { applyShiftSelection } from '@/lib/timesheet-shift-hours';
import type { TimesheetPeriodDay } from '@/lib/timesheet-period';
import type { TimesheetDayEntry, TimesheetShiftType } from '@/lib/timesheet-types';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';

interface AgentRow {
  matricule: string;
  nom: string;
  departement: string;
  localisation: string;
  from: string;
  to: string;
  shiftType: TimesheetShiftType | null;
  ordinary: number;
  shift1: number;
  shift2: number;
  shift3: number;
  night: number;
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
  onClose: () => void;
  onSaved: () => void;
}

function hasCompleteHours(row: Pick<AgentRow, 'from' | 'to'>): boolean {
  return Boolean(row.from.trim() && row.to.trim());
}

function hasShiftDefined(row: Pick<AgentRow, 'shiftType'>): boolean {
  return row.shiftType !== null;
}

function buildAgentRows(
  agents: Employee[],
  saved: Record<string, TimesheetDayEntry>,
  day: TimesheetPeriodDay,
): AgentRow[] {
  return agents.map((employee) => {
    const entry = saved[employee.matricule];
    const base = {
      matricule: employee.matricule,
      nom: employee.nom,
      departement: employee.departement,
      localisation: employee.localisation ?? '',
      from: entry?.from ?? '',
      to: entry?.to ?? '',
      shiftType: entry?.shiftType ?? null,
    };
    return recalculateRow(base, { date: day.date, localisation: base.localisation });
  });
}

export default function TimesheetManagerDayModal({
  open,
  day,
  department,
  agents,
  periodYear,
  periodMonth,
  canEdit = false,
  locked = false,
  onClose,
  onSaved,
}: Props) {
  const [agentRows, setAgentRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
      setAgentRows(buildAgentRows(agents, json.entries ?? {}, day));
    } catch {
      setAgentRows(buildAgentRows(agents, {}, day));
    } finally {
      setLoading(false);
    }
  }, [agents, day.dateKey, department, open, periodMonth, periodYear]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const updateAgent = useCallback((matricule: string, patch: Partial<AgentRow>) => {
    if (!canEdit) return;
    setAgentRows((prev) =>
      prev.map((row) => {
        if (row.matricule !== matricule) return row;
        const ctx = { date: day.date, localisation: row.localisation };
        if ('shiftType' in patch && patch.shiftType !== undefined) {
          return recalculateRow(applyShiftSelection(row, patch.shiftType, ctx), ctx);
        }
        return recalculateRow({ ...row, ...patch }, ctx);
      }),
    );
  }, [canEdit, day]);

  const stats = useMemo(() => {
    const plannedCount = agentRows.filter(hasShiftDefined).length;
    const hoursCount = agentRows.filter((row) => hasShiftDefined(row) && hasCompleteHours(row)).length;
    const dayTotalHours = agentRows.reduce((sum, row) => {
      if (!hasShiftDefined(row) || !hasCompleteHours(row)) return sum;
      return sum + rowTotalHours(row);
    }, 0);
    return { plannedCount, hoursCount, dayTotalHours };
  }, [agentRows]);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheet/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: periodYear,
          month: periodMonth,
          dateKey: day.dateKey,
          department,
          entries: agentRows.map((row) => ({
            matricule: row.matricule,
            from: row.from,
            to: row.to,
            shiftType: row.shiftType,
          })),
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Enregistrement impossible');
      }
      await showSuccess('Horaires enregistrés pour la journée');
      onSaved();
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Agents du département — {department}</h3>
            <p className="timesheet-manager-modal-subtitle">
              {day.date.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              {locked ? ' · Journée verrouillée (100 %)' : ''}
              {!locked ? (
                <>
                  {' · '}
                  {stats.plannedCount} agent(s) planifié(s)
                  {' · '}
                  {stats.hoursCount} avec horaires
                  {' · '}
                  Total jour : {formatHoursValue(stats.dayTotalHours)} h
                </>
              ) : null}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body timesheet-manager-modal-body">
          {locked ? (
            <p className="timesheet-manager-modal-locked-hint">
              Cette journée est complète pour tout le département. Consultation seule — modification désactivée.
            </p>
          ) : (
            <p className="timesheet-manager-modal-hint">
              Sélectionnez le shift (ou Off pour un jour de repos avec heures prestées = HS). La présence est
              déterminée par Début et Fin — laissez vide pour un agent absent.
            </p>
          )}

          <div className="table-wrap timesheet-manager-table-wrap">
            <table className="timesheet-table timesheet-manager-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Mat.</th>
                  <th>Shift</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th title="Général heures supplémentaires">Gén.</th>
                  <th title="Shift 1 heures supplémentaires">S1</th>
                  <th title="Shift 2 heures supplémentaires">S2</th>
                  <th title="Shift 3 heures supplémentaires">S3</th>
                  <th title="Heures de nuit">Nuit</th>
                  <th title="Total heures du jour">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="timesheet-manager-loading">
                      Chargement…
                    </td>
                  </tr>
                ) : agentRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="timesheet-manager-loading">
                      Aucun agent dans ce département
                    </td>
                  </tr>
                ) : (
                  agentRows.map((row) => {
                    const configured = hasShiftDefined(row);
                    const complete = configured && hasCompleteHours(row);
                    return (
                      <tr
                        key={row.matricule}
                        className={complete ? 'timesheet-manager-present-row' : configured ? 'timesheet-manager-planned-row' : ''}
                      >
                        <td className="timesheet-manager-agent-cell">{row.nom}</td>
                        <td>{row.matricule}</td>
                        <td>
                          <TimesheetShiftSelect
                            value={row.shiftType}
                            onChange={(shiftType) => updateAgent(row.matricule, { shiftType })}
                            disabled={!canEdit}
                          />
                        </td>
                        <td>
                          <TimesheetTimeInput
                            value={row.from}
                            onChange={(from) => updateAgent(row.matricule, { from })}
                            disabled={!canEdit}
                          />
                        </td>
                        <td>
                          <TimesheetTimeInput
                            value={row.to}
                            onChange={(to) => updateAgent(row.matricule, { to })}
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="timesheet-calc-cell">{complete ? formatHoursValue(row.ordinary) : ''}</td>
                        <td className="timesheet-calc-cell">{complete ? formatHoursValue(row.shift1) : ''}</td>
                        <td className="timesheet-calc-cell">{complete ? formatHoursValue(row.shift2) : ''}</td>
                        <td className="timesheet-calc-cell">{complete ? formatHoursValue(row.shift3) : ''}</td>
                        <td className="timesheet-calc-cell">{complete ? formatHoursValue(row.night) : ''}</td>
                        <td className="timesheet-calc-cell timesheet-total-day-cell">
                          {complete ? formatHoursValue(rowTotalHours(row)) : ''}
                        </td>
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
            Annuler
          </button>
          {canEdit ? (
            <button type="button" className="btn btn-accent btn-with-icon" onClick={handleSave} disabled={saving || loading}>
              {saving ? <BtnSpinner /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer le jour'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
