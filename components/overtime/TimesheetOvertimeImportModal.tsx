'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import { getTimesheetWeekFromTo, TIMESHEET_WEEKS_PER_PERIOD } from '@/lib/timesheet-period';
import { showError, showSuccess, showWarning } from '@/lib/swal';

interface Props {
  open: boolean;
  periodYear: number;
  periodMonth: number;
  initialWeekIndex?: number;
  onClose: () => void;
  onImported: () => void;
}

export default function TimesheetOvertimeImportModal({
  open,
  periodYear,
  periodMonth,
  initialWeekIndex,
  onClose,
  onImported,
}: Props) {
  const weekOptions = useMemo(
    () =>
      Array.from({ length: TIMESHEET_WEEKS_PER_PERIOD }, (_, weekIndex) => {
        const week = getTimesheetWeekFromTo(periodYear, periodMonth, weekIndex);
        return {
          weekIndex,
          label: `Semaine ${weekIndex + 1}`,
          range: week.label,
        };
      }),
    [periodYear, periodMonth],
  );

  const [weekIndex, setWeekIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && initialWeekIndex !== undefined) setWeekIndex(initialWeekIndex);
  }, [open, initialWeekIndex]);

  const selectedWeek = weekOptions[weekIndex] ?? weekOptions[0];

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('year', String(periodYear));
      form.append('month', String(periodMonth));
      form.append('weekIndex', String(weekIndex));
      form.append('bulk', 'true');

      const res = await fetch('/api/timesheet/weekly-ot', { method: 'POST', body: form });
      const json = (await res.json()) as {
        error?: string;
        imported?: number;
        skipped?: number;
        lockedDepartments?: string[];
        results?: Array<{ department: string; status: 'imported' | 'locked'; imported: number }>;
      };
      if (!res.ok) throw new Error(json.error ?? 'Import impossible');

      const importedLines = json.imported ?? 0;
      const skippedLines = json.skipped ?? 0;
      const importedSummary = (json.results ?? [])
        .filter((item) => item.status === 'imported')
        .map((item) => `${item.department}: ${item.imported}`)
        .join(', ');
      const lockedSummary = (json.lockedDepartments ?? []).join(', ');
      const skippedSuffix =
        skippedLines > 0 ? ` ${skippedLines} ligne(s) déjà présente(s), ignorée(s).` : '';

      if (importedLines > 0 && lockedSummary) {
        await showSuccess(
          `${importedLines} nouvelle(s) ligne(s) importée(s)${importedSummary ? ` (${importedSummary})` : ''}.${skippedSuffix} Départements ignorés (verrouillés) : ${lockedSummary}.`,
        );
        onImported();
        onClose();
      } else if (importedLines > 0) {
        await showSuccess(
          `${importedLines} nouvelle(s) ligne(s) importée(s)${importedSummary ? ` (${importedSummary})` : ''}.${skippedSuffix}`,
        );
        onImported();
        onClose();
      } else if (lockedSummary) {
        await showWarning(
          `Aucune nouvelle ligne importée. Départements déjà verrouillés : ${lockedSummary}.`,
        );
      } else {
        await showWarning('Aucune nouvelle ligne importée pour les départements autorisés.');
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Import impossible');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-ot-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Importer les overtimes</h3>
            <p className="timesheet-manager-modal-subtitle">
              Fichier Excel multi-départements (format RG) — seules les lignes absentes de la semaine sont ajoutées ; les matricules déjà importés ne sont pas modifiés.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body timesheet-manager-modal-body">
          <label className="timesheet-ot-import-week-field">
            <span>Semaine cible</span>
            <select
              className="timesheet-ot-import-week-select"
              value={weekIndex}
              onChange={(e) => setWeekIndex(Number(e.target.value))}
            >
              {weekOptions.map((option) => (
                <option key={option.weekIndex} value={option.weekIndex}>
                  {option.label} — {option.range}
                </option>
              ))}
            </select>
            {selectedWeek?.range ? (
              <span className="timesheet-ot-import-week-hint">{selectedWeek.range}</span>
            ) : null}
          </label>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="timesheet-week-ot-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />

          <button
            type="button"
            className="btn btn-accent btn-with-icon"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? <BtnSpinner /> : null}
            {importing ? 'Import en cours…' : 'Choisir le fichier Excel'}
          </button>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
