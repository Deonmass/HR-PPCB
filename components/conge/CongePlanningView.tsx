'use client';

import { useMemo, useState } from 'react';
import {
  eachIsoDateInclusive,
  formatCongeNumber,
  formatIsoFr,
  isOnOrAfterHire,
  isSundayIso,
  monthStartBalance,
  monthlyAccrual,
  resolveDayCode,
  seniorityYearsAsOfJan1,
  utcWeekday,
} from '@/lib/conge-rules';
import { LEAVE_CODES, type CongeBundle, type CongeEmployeeView, type LeaveCode } from '@/lib/conge-types';

interface Props {
  bundle: CongeBundle;
  monthStart: string;
  monthEnd: string;
  department: string;
  departments: string[];
  search: string;
  canEdit: boolean;
  saving: boolean;
  onDepartmentChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSetDay: (employee: CongeEmployeeView, iso: string, code: LeaveCode | '') => void;
}

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export default function CongePlanningView({
  bundle,
  monthStart,
  monthEnd,
  department,
  departments,
  search,
  canEdit,
  saving,
  onDepartmentChange,
  onSearchChange,
  onSetDay,
}: Props) {
  const days = useMemo(() => eachIsoDateInclusive(monthStart, monthEnd), [monthStart, monthEnd]);
  const [picker, setPicker] = useState<{ employee: CongeEmployeeView; iso: string } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dept = department.trim().toLowerCase();
    return bundle.employees.filter((emp) => {
      if (dept && emp.departement.trim().toLowerCase() !== dept) return false;
      if (!q) return true;
      return `${emp.matricule} ${emp.nom} ${emp.jobTitle} ${emp.grade}`.toLowerCase().includes(q);
    });
  }, [bundle.employees, department, search]);

  return (
    <div className="conge-planning">
      <div className="mvt-toolbar">
        <div className="mvt-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Rechercher agent, matricule…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Rechercher"
          />
        </div>
        <div className="mvt-select-wrap">
          <select
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value)}
            aria-label="Filtrer par département"
          >
            <option value="">Tous les départements</option>
            {departments.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <span className="mvt-count-pill">{rows.length}</span>
      </div>

      <div className="panel conge-grid-panel">
        {rows.length === 0 ? (
          <p className="empty-state">Aucun agent dans le planning pour ce filtre.</p>
        ) : (
          <div className="conge-grid-wrap">
            <table className="data-table conge-grid">
              <thead>
                <tr>
                  <th className="conge-sticky-1">Matricule</th>
                  <th className="conge-sticky-2">Nom</th>
                  <th>Département</th>
                  <th>Grade</th>
                  <th>Ancienneté</th>
                  <th>Augm.</th>
                  <th>Solde</th>
                  {days.map((iso) => {
                    const dow = utcWeekday(iso) ?? 0;
                    return (
                      <th key={iso} className={`conge-day-head${dow === 0 ? ' is-sunday' : ''}`}>
                        <span>{iso.slice(8)}</span>
                        <small>{DOW[dow]}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => {
                  const month = Number(monthStart.slice(5, 7));
                  const seniority = seniorityYearsAsOfJan1(emp.appointmentDate, bundle.exerciseYear);
                  const accrual = monthlyAccrual(emp.grade, seniority, bundle.grades, bundle.seniorityBands);
                  const solde = monthStartBalance(
                    emp,
                    bundle.exerciseYear,
                    month,
                    bundle.grades,
                    bundle.seniorityBands,
                  );
                  return (
                    <tr key={emp.matricule}>
                      <td className="conge-sticky-1 mono">{emp.matricule}</td>
                      <td className="conge-sticky-2">
                        <strong>{emp.nom}</strong>
                        {!emp.fromHr ? <span className="conge-hr-flag">hors HR</span> : null}
                      </td>
                      <td>{emp.departement || '—'}</td>
                      <td>{emp.grade || '—'}</td>
                      <td>{formatCongeNumber(seniority, 2)}</td>
                      <td>{formatCongeNumber(accrual, 2)}</td>
                      <td>{formatCongeNumber(solde, 1)}</td>
                      {days.map((iso) => {
                        const sunday = isSundayIso(iso);
                        const beforeHire = !isOnOrAfterHire(iso, emp.appointmentDate);
                        const code = resolveDayCode(iso, emp.appointmentDate, emp.days);
                        const locked = sunday || beforeHire;
                        const title = locked
                          ? sunday
                            ? 'Dimanche'
                            : 'Avant date d’embauche'
                          : `${emp.nom} — ${formatIsoFr(iso)}${code ? ` (${code})` : ''}`;
                        return (
                          <td key={iso} className="conge-day-cell">
                            <button
                              type="button"
                              className={`conge-day${code ? ` is-${code.toLowerCase()}` : ''}${sunday ? ' is-sunday' : ''}${beforeHire ? ' is-before-hire' : ''}`}
                              disabled={locked || !canEdit || saving}
                              title={canEdit && !locked ? `Voir le détail — ${title}` : title}
                              onClick={() => {
                                if (locked || !canEdit) return;
                                setPicker({ employee: emp, iso });
                              }}
                            >
                              {code || ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picker ? (
        <div className="modal-overlay conge-code-overlay" onClick={() => setPicker(null)}>
          <div
            className="modal conge-code-modal"
            role="dialog"
            aria-labelledby="conge-code-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="conge-code-title">Code du jour</h3>
            <p>
              {picker.employee.nom} · {formatIsoFr(picker.iso)}
            </p>
            <div className="conge-code-choices">
              {LEAVE_CODES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`conge-code-choice is-${item.code.toLowerCase()}`}
                  onClick={() => {
                    onSetDay(picker.employee, picker.iso, item.code);
                    setPicker(null);
                  }}
                >
                  <strong>{item.code}</strong>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPicker(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
