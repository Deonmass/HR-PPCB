'use client';

import { useEffect, useState } from 'react';
import { formatCongeNumber } from '@/lib/conge-rules';
import { LEAVE_CODES, type CongeGradeRow, type CongeSeniorityBand } from '@/lib/conge-types';

interface Props {
  grades: CongeGradeRow[];
  seniorityBands: CongeSeniorityBand[];
  canEdit: boolean;
  saving: boolean;
  onSave: (grades: CongeGradeRow[], bands: CongeSeniorityBand[]) => Promise<void>;
}

export default function CongeGradesView({
  grades,
  seniorityBands,
  canEdit,
  saving,
  onSave,
}: Props) {
  const [gradeRows, setGradeRows] = useState(grades);
  const [bands, setBands] = useState(seniorityBands);

  useEffect(() => {
    setGradeRows(grades);
    setBands(seniorityBands);
  }, [grades, seniorityBands]);

  const dirty =
    JSON.stringify(gradeRows) !== JSON.stringify(grades)
    || JSON.stringify(bands) !== JSON.stringify(seniorityBands);

  return (
    <div className="conge-grades">
      <div className="conge-legend-row">
        {LEAVE_CODES.map((item) => (
          <span key={item.code} className={`conge-legend-chip is-${item.code.toLowerCase()}`}>
            <strong>{item.code}</strong> {item.label}
          </span>
        ))}
        <span className="conge-legend-chip is-before-hire">Vide = dimanche / avant embauche</span>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Barème par grade</h3>
          {canEdit && dirty ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void onSave(gradeRows, bands)}
            >
              Enregistrer
            </button>
          ) : null}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Catégorie</th>
                <th>Jours / an</th>
                <th>Jours / mois</th>
                <th>Limite / an</th>
              </tr>
            </thead>
            <tbody>
              {gradeRows.map((row, index) => (
                <tr key={row.grade}>
                  <td>{row.grade}</td>
                  <td>{row.categorie}</td>
                  <td>
                    {canEdit ? (
                      <input
                        type="number"
                        className="conge-num-input"
                        value={row.joursAnnuels}
                        onChange={(e) => {
                          const joursAnnuels = Number(e.target.value);
                          setGradeRows((prev) =>
                            prev.map((item, i) =>
                              i === index
                                ? { ...item, joursAnnuels, joursParMois: joursAnnuels / 12 }
                                : item,
                            ),
                          );
                        }}
                      />
                    ) : (
                      row.joursAnnuels
                    )}
                  </td>
                  <td>{formatCongeNumber(row.joursParMois, 3)}</td>
                  <td>
                    {canEdit ? (
                      <input
                        type="number"
                        className="conge-num-input"
                        value={row.limiteAnnee}
                        onChange={(e) => {
                          const limiteAnnee = Number(e.target.value);
                          setGradeRows((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, limiteAnnee } : item)),
                          );
                        }}
                      />
                    ) : (
                      row.limiteAnnee
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Tranches d’ancienneté (+1 jour / 3 ans)</h3>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tranche</th>
                <th>Ancienneté min (ans)</th>
                <th>Jours extra / an</th>
                <th>Mensuel (/12)</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band, index) => (
                <tr key={band.label}>
                  <td>{band.label}</td>
                  <td>{band.minYears}</td>
                  <td>
                    {canEdit ? (
                      <input
                        type="number"
                        className="conge-num-input"
                        value={band.extraDaysPerYear}
                        onChange={(e) => {
                          const extraDaysPerYear = Number(e.target.value);
                          setBands((prev) =>
                            prev.map((item, i) =>
                              i === index
                                ? { ...item, extraDaysPerYear, extraPerMonth: extraDaysPerYear / 12 }
                                : item,
                            ),
                          );
                        }}
                      />
                    ) : (
                      band.extraDaysPerYear
                    )}
                  </td>
                  <td>{formatCongeNumber(band.extraPerMonth, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
