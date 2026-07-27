'use client';

import { DOMESTIC_TRAVEL_ALLOWANCE_RATES } from '@/lib/travel-allowance-rates';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TravelAllowanceRatesModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay travel-allowance-overlay" onClick={onClose}>
      <div
        className="modal modal-lg travel-allowance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-allowance-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="travel-allowance-title">Fig1. Domestic travel allowance rate</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="travel-allowance-table-wrap">
            <table className="travel-allowance-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Employee category</th>
                  <th colSpan={2}>Allowance per day</th>
                  <th rowSpan={2}>Transport allowance</th>
                  <th rowSpan={2}>Accommodation allowance</th>
                </tr>
                <tr>
                  <th>Trip allowance (Not to justify)</th>
                  <th>Food allowance (Not to justify)</th>
                </tr>
              </thead>
              <tbody>
                {DOMESTIC_TRAVEL_ALLOWANCE_RATES.map((row) => (
                  <tr key={row.category}>
                    <td className="travel-allowance-category">{row.category}</td>
                    <td>{row.tripAllowance}</td>
                    <td>{row.foodAllowance}</td>
                    <td>{row.transportAllowance}</td>
                    <td>{row.accommodationAllowance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
