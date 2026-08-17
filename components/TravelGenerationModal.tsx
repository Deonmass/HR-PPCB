'use client';

import { useEffect, useState } from 'react';

export interface GenerationStep {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  steps: GenerationStep[];
  activeStepIndex: number;
  stepProgress: number[];
  complete: boolean;
  error: string | null;
  onClose: () => void;
}

export default function TravelGenerationModal({
  open,
  steps,
  activeStepIndex,
  stepProgress,
  complete,
  error,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(open);
  }, [open]);

  if (!visible) return null;

  return (
    <div className="modal-overlay travel-generation-overlay">
      <div className="modal travel-generation-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{complete ? 'Génération terminée' : 'Génération des fichiers'}</h3>
          {complete && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          )}
        </div>

        <div className="modal-body">
          {!complete && !error && (
            <p className="travel-generation-lead">
              Veuillez patienter pendant la création des documents de voyage…
            </p>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          <ul className="travel-generation-steps">
            {steps.map((step, index) => {
              const progress = stepProgress[index] ?? 0;
              const isActive = !complete && !error && progress > 0 && progress < 100;
              const isDone = complete || progress >= 100;

              return (
                <li
                  key={step.id}
                  className={`travel-generation-step${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
                >
                  <div className="travel-generation-step-head">
                    <span className="travel-generation-step-label">{step.label}</span>
                    <span className="travel-generation-step-pct">{Math.round(progress)}%</span>
                  </div>
                  <div className="progress-bar travel-generation-progress">
                    <div
                      className={`progress-fill high${isDone ? ' complete' : ''}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {complete && (
            <p className="travel-generation-success">
              Les documents ont été générés et téléchargés dans votre dossier Téléchargements.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
