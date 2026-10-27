'use client';

import { useEffect, useMemo, useState } from 'react';
import { orgPersonShortName } from '@/lib/organigramme';

export type OrgManagerChoice = {
  id: string;
  nom: string;
  detail: string;
  kind?: 'interne' | 'externe' | 'vacant';
};

type Props = {
  title: string;
  who: string;
  hint?: string;
  choices: OrgManagerChoice[];
  onClose: () => void;
  onSave: (choiceId: string) => Promise<void>;
};

function ChoiceColumn({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: OrgManagerChoice[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="org-choice-column">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="org-dialog-empty">Aucun résultat.</p>
      ) : (
        <ul className="org-dialog-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={selected === item.id ? 'is-selected' : ''}
                onClick={() => onSelect(item.id)}
              >
                <strong>{item.kind === 'vacant' ? item.nom : (orgPersonShortName(item.nom) || item.nom)}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function OrganigrammeManagerDialog({
  title,
  who,
  hint,
  choices,
  onClose,
  onSave,
}: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const matched = q
      ? choices.filter((item) => fold(`${item.nom} ${item.detail} ${item.kind || ''}`).includes(q))
      : choices;
    const internes = matched.filter((item) => item.kind !== 'externe' && item.kind !== 'vacant');
    const externes = matched.filter((item) => item.kind === 'externe');
    const vacants = matched.filter((item) => item.kind === 'vacant');
    if (q) {
      return {
        internes: internes.slice(0, 12),
        externes: externes.slice(0, 12),
        vacants: vacants.slice(0, 12),
      };
    }
    return {
      internes: internes.slice(0, 8),
      externes: externes.slice(0, 8),
      vacants: vacants.slice(0, 8),
    };
  }, [choices, query]);

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onSave(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="org-dialog-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="org-dialog org-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="org-manager-title">{title}</h3>
        <p className="org-dialog-who">{who}</p>
        {hint ? <p className="org-dialog-hint">{hint}</p> : null}
        <label className="org-filter">
          <span>Nouveau N+1</span>
          <input
            type="search"
            autoFocus
            placeholder="Nom, poste, interne, externe ou vacant…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {visible.internes.length === 0 && visible.externes.length === 0 && visible.vacants.length === 0 ? (
          <p className="org-dialog-empty">Aucun N+1 possible.</p>
        ) : (
          <div className="org-choice-columns">
            <ChoiceColumn title="Internes" items={visible.internes} selected={selected} onSelect={setSelected} />
            <ChoiceColumn title="Externes" items={visible.externes} selected={selected} onSelect={setSelected} />
            <ChoiceColumn title="Postes vacants" items={visible.vacants} selected={selected} onSelect={setSelected} />
          </div>
        )}
        {saving ? (
          <p className="org-dialog-saving" role="status">
            <span className="btn-spinner" aria-hidden="true" />
            Enregistrement du N+1…
          </p>
        ) : null}
        <div className="org-dialog-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving || !selected}>
            {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
