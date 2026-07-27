'use client';

import { useMemo, useState } from 'react';
import ExpensesMonthlyChart from '@/components/ExpensesMonthlyChart';
import {
  aggregateExpensesByMonth,
  filterValidExpenses,
  formatUsd,
  getExpenseYears,
} from '@/lib/projects';
import type { ProjectExpense, ProjectRecord } from '@/lib/project-types';

type Tab = 'table' | 'chart';

interface Props {
  project: ProjectRecord;
  expenses: ProjectExpense[];
  onClose: () => void;
}

function matchProjectName(expenseProject: string, projectName: string): boolean {
  return expenseProject.trim().toLowerCase() === projectName.trim().toLowerCase();
}

export default function ProjectExpensesModal({ project, expenses, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('table');

  const projectExpenses = useMemo(
    () => filterValidExpenses(expenses).filter((e) => matchProjectName(e.projet, project.name)),
    [expenses, project.name],
  );

  const years = useMemo(() => getExpenseYears(projectExpenses), [projectExpenses]);
  const [year, setYear] = useState(() => years[0] ?? String(new Date().getFullYear()));

  const activeYear = years.includes(year) ? year : (years[0] ?? year);

  const yearExpenses = useMemo(
    () => projectExpenses.filter((e) => e.date.split('/')[2] === activeYear),
    [projectExpenses, activeYear],
  );

  const chartMonths = useMemo(
    () => aggregateExpensesByMonth(projectExpenses, activeYear),
    [projectExpenses, activeYear],
  );

  const total = useMemo(
    () => projectExpenses.reduce((sum, e) => sum + e.montant, 0),
    [projectExpenses],
  );

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-lg modal-form project-expenses-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Dépenses — {project.name}</h3>
            <p className="modal-subtitle">Total : {formatUsd(total)}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab-btn${tab === 'table' ? ' active' : ''}`}
            onClick={() => setTab('table')}
          >
            Tableau
          </button>
          <button
            type="button"
            className={`modal-tab-btn${tab === 'chart' ? ' active' : ''}`}
            onClick={() => setTab('chart')}
          >
            Graphique
          </button>
          {tab === 'chart' && years.length > 0 && (
            <select
              className="filter-select modal-year-select"
              value={activeYear}
              onChange={(e) => setYear(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>

        <div className="modal-body project-expenses-modal-body">
          {tab === 'table' ? (
            <div className="project-expenses-table-wrap">
              <table className="project-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Date</th>
                    <th>Motif</th>
                    <th className="text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {projectExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted-cell">Aucune dépense enregistrée</td>
                    </tr>
                  ) : (
                    projectExpenses.map((expense, index) => (
                      <tr key={expense.id}>
                        <td>{index + 1}</td>
                        <td>{expense.date}</td>
                        <td>{expense.motif}</td>
                        <td className="text-right project-money-bold">{formatUsd(expense.montant)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {projectExpenses.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}><strong>Total ({projectExpenses.length})</strong></td>
                      <td className="text-right project-money-bold"><strong>{formatUsd(total)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="project-expenses-chart-wrap">
              {yearExpenses.length === 0 ? (
                <p className="text-muted-cell">Aucune dépense pour {activeYear}</p>
              ) : (
                <ExpensesMonthlyChart months={chartMonths} year={activeYear} />
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
