'use client';

import { TIMESHEET_POLICY_SECTIONS } from '@/lib/timesheet-policy';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TimesheetPolicyModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form timesheet-policy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Politique — Heures supplémentaires, nuit &amp; shifts</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body timesheet-policy-body">
          {TIMESHEET_POLICY_SECTIONS.map((section) => (
            <section key={section.title} className="timesheet-policy-section">
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
