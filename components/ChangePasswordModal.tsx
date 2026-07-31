'use client';

import { useMemo, useState } from 'react';
import { checkPasswordCriteria } from '@/lib/password-policy';
import { showError, showSuccess } from '@/lib/swal';

interface Props {
  /** 'self' : l'utilisateur change son propre mot de passe (ancien requis).
   *  'reset' : un admin réinitialise le mot de passe d'un utilisateur. */
  mode: 'self' | 'reset';
  /** Requis en mode 'reset'. */
  targetUser?: { id: string; displayName: string };
  onClose: () => void;
}

export default function ChangePasswordModal({ mode, targetUser, onClose }: Props) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  const criteria = useMemo(() => checkPasswordCriteria(newPassword), [newPassword]);
  const satisfied = criteria.filter((criterion) => criterion.ok).length;
  const allCriteriaOk = satisfied === criteria.length;
  const confirmOk = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canSubmit =
    allCriteriaOk && confirmOk && (mode === 'reset' || oldPassword.length > 0) && !saving;

  const progressPercent = Math.round((satisfied / criteria.length) * 100);
  const progressClass =
    satisfied === criteria.length ? 'is-ok' : satisfied >= 3 ? 'is-mid' : 'is-low';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res =
        mode === 'self'
          ? await fetch('/api/auth/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
            })
          : await fetch('/api/auth/users/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: targetUser?.id, newPassword }),
            });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(
        mode === 'self'
          ? 'Mot de passe modifié'
          : `Mot de passe réinitialisé pour ${targetUser?.displayName ?? ''}`.trim(),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputType = showPasswords ? 'text' : 'password';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form pwd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {mode === 'self'
              ? 'Modifier le mot de passe'
              : `Réinitialiser le mot de passe — ${targetUser?.displayName ?? ''}`}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid pwd-form-grid">
            {mode === 'self' && (
              <div className="form-group form-group-full">
                <label>Ancien mot de passe</label>
                <input
                  type={inputType}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
            )}
            <div className="form-group form-group-full">
              <label>Nouveau mot de passe</label>
              <input
                type={inputType}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus={mode === 'reset'}
              />
            </div>
            <div className="form-group form-group-full">
              <label>Confirmation</label>
              <input
                type={inputType}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && !confirmOk && (
                <p className="pwd-confirm-error">La confirmation ne correspond pas.</p>
              )}
            </div>
          </div>

          <div className="pwd-progress">
            <div className="pwd-progress-track">
              <div
                className={`pwd-progress-fill ${progressClass}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="pwd-progress-label">
              {satisfied}/{criteria.length} critères
            </span>
          </div>

          <ul className="pwd-criteria">
            {criteria.map((criterion) => (
              <li key={criterion.id} className={criterion.ok ? 'ok' : ''}>
                <span className="pwd-criteria-mark" aria-hidden="true">
                  {criterion.ok ? '✓' : '○'}
                </span>
                {criterion.label}
              </li>
            ))}
            <li className={confirmOk ? 'ok' : ''}>
              <span className="pwd-criteria-mark" aria-hidden="true">
                {confirmOk ? '✓' : '○'}
              </span>
              Confirmation identique
            </li>
          </ul>

          <label className="pwd-show-toggle">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
            />
            Afficher les mots de passe
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving
              ? 'Enregistrement…'
              : mode === 'self'
                ? 'Modifier le mot de passe'
                : 'Réinitialiser'}
          </button>
        </div>
      </div>
    </div>
  );
}
