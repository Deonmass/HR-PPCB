'use client';

import { AIRTIME_POLICY_GRILLE } from '@/lib/airtime';

export default function AirtimePolicyTable() {
  return (
    <table className="airtime-policy-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Grade</th>
          <th>Net Monthly Allowance Limit in USD</th>
        </tr>
      </thead>
      <tbody>
        {AIRTIME_POLICY_GRILLE.map((row) => (
          <tr key={row.description}>
            <td>{row.description}</td>
            <td>{row.grades}</td>
            <td className="num">{row.allowanceUsd}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
