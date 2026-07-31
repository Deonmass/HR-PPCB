'use client';

import ExitDocsGenerator from './ExitDocsGenerator';
import type { Employee } from '@/lib/types';

interface Props {
  employee: Employee;
  onClose: () => void;
}

export default function ExitDocsModal({ employee, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form exit-docs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Documents d’exit — {employee.nom}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <ExitDocsGenerator employee={employee} onGenerated={onClose} />
        </div>
      </div>
    </div>
  );
}
