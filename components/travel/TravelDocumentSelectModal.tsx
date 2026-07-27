'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GenerationStep } from '@/components/TravelGenerationModal';

interface Props {
  open: boolean;
  steps: GenerationStep[];
  onConfirm: (selectedIds: string[]) => void;
  onClose: () => void;
}

export default function TravelDocumentSelectModal({
  open,
  steps,
  onConfirm,
  onClose,
}: Props) {
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(stepIds));

  useEffect(() => {
    if (open) setSelected(new Set(stepIds));
  }, [open, stepIds]);

  if (!open) return null;

  const allChecked = steps.length > 0 && steps.every((step) => selected.has(step.id));
  const someChecked = steps.some((step) => selected.has(step.id));

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(stepIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!someChecked) return;
    onConfirm(steps.filter((step) => selected.has(step.id)).map((step) => step.id));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-form travel-document-select-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-doc-select-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="travel-doc-select-title">Fichiers à générer</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="travel-document-select-lead">
            Cochez les documents à produire pour cette mission.
          </p>

          <label className="travel-document-select-all">
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = someChecked && !allChecked;
              }}
              onChange={toggleAll}
            />
            <span>Tout cocher / décocher</span>
          </label>

          <ul className="travel-document-select-list">
            {steps.map((step) => (
              <li key={step.id}>
                <label className="travel-document-select-item">
                  <input
                    type="checkbox"
                    checked={selected.has(step.id)}
                    onChange={() => toggleOne(step.id)}
                  />
                  <span>{step.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!someChecked}
            onClick={handleConfirm}
          >
            Générer
          </button>
        </div>
      </div>
    </div>
  );
}
