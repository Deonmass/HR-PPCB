'use client';

import { useMemo, type ReactNode } from 'react';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import type { Employee } from '@/lib/types';

interface DeclarationAgentToolbarProps {
  employees: Employee[];
  query: string;
  onQuery: (value: string) => void;
  onAdd: (employee: Employee) => void;
  exitOnly: boolean;
  onExitOnly: (value: boolean) => void;
  addedCount: number;
  canCreate: boolean;
  generating: boolean;
  onDownload: () => void;
}

export function DeclarationAgentToolbar({
  employees,
  query,
  onQuery,
  onAdd,
  exitOnly,
  onExitOnly,
  addedCount,
  canCreate,
  generating,
  onDownload,
}: DeclarationAgentToolbarProps) {
  return (
    <div className="mvt-toolbar docs-declaration-toolbar">
      <div className="docs-declaration-add">
        <EmployeeSuggestInput
          employees={employees}
          value={query}
          onChange={onQuery}
          onEmployeeSelect={(employee) => {
            onAdd(employee);
            onQuery('');
          }}
          placeholder={
            exitOnly
              ? 'Ajouter un agent sorti (nom ou matricule)…'
              : 'Ajouter un agent (nom ou matricule)…'
          }
        />
      </div>
      <label className="form-checkbox docs-declaration-exit-only">
        <input
          type="checkbox"
          checked={exitOnly}
          onChange={(event) => onExitOnly(event.target.checked)}
        />
        exit only
      </label>
      <span className="docs-declaration-count">
        {addedCount} agent{addedCount > 1 ? 's' : ''}
      </span>
      {canCreate ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={generating || addedCount === 0}
          onClick={onDownload}
        >
          {generating ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              Génération…
            </>
          ) : (
            addedCount > 1 ? `Télécharger le PDF (${addedCount})` : 'Télécharger le PDF'
          )}
        </button>
      ) : null}
    </div>
  );
}

interface DeclarationAgentTableProps {
  rows: Employee[];
  extraHead?: ReactNode;
  renderExtra?: (employee: Employee) => ReactNode;
  generating: boolean;
  onRemove: (matricule: string) => void;
  emptyLabel: string;
}

export function DeclarationAgentTable({
  rows,
  extraHead,
  renderExtra,
  generating,
  onRemove,
  emptyLabel,
}: DeclarationAgentTableProps) {
  const colCount = 5 + (extraHead ? 1 : 0) + 1;

  return (
    <div className="panel mvt-table-panel docs-declaration-table-panel">
      <div className="table-wrap">
        <table className="data-table mvt-table docs-declaration-table">
          <thead>
            <tr>
              <th className="is-num">N°</th>
              <th>Matricule</th>
              <th>Nom</th>
              <th>Poste</th>
              <th>Département</th>
              {extraHead}
              <th className="docs-declaration-col-action"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="empty-state">{emptyLabel}</td>
              </tr>
            ) : (
              rows.map((employee, index) => (
                <tr key={employee.matricule}>
                  <td className="is-num">{index + 1}</td>
                  <td className="is-num">{employee.matricule}</td>
                  <td><strong>{employee.nom}</strong></td>
                  <td>{employee.jobTitle || employee.position || '—'}</td>
                  <td>{employee.departement || '—'}</td>
                  {renderExtra ? renderExtra(employee) : null}
                  <td className="docs-declaration-col-action">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={generating}
                      onClick={() => onRemove(employee.matricule)}
                      aria-label={`Retirer ${employee.nom}`}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function useDeclarationPickerSource(
  employees: Employee[],
  exits: Employee[],
  exitOnly: boolean,
  added: Employee[],
): Employee[] {
  return useMemo(() => {
    const source = exitOnly ? exits : employees;
    const taken = new Set(added.map((row) => row.matricule));
    return source.filter((row) => !taken.has(row.matricule));
  }, [added, employees, exitOnly, exits]);
}
