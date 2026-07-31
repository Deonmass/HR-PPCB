'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  label: string;
  /** Valeurs uniques disponibles (déjà triées de préférence). */
  values: string[];
  /** Valeurs cochées ([] = aucun filtre → tout). */
  selected: string[];
  onChange: (next: string[]) => void;
}

/** Filtre de colonne façon Excel : entonnoir dans l'en-tête + liste à cocher. */
export default function CharroiHeaderFilter({ label, values, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visibleValues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((value) => value.toLowerCase().includes(q));
  }, [values, query]);

  const toggleValue = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="charroi-hf" ref={wrapRef}>
      <button
        type="button"
        className={`charroi-hf-btn${active ? ' active' : ''}${open ? ' open' : ''}`}
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery('');
        }}
        title={active ? `${label} — ${selected.length} filtre(s)` : `Filtrer ${label}`}
        aria-label={`Filtrer ${label}`}
      >
        <span className="charroi-hf-label">{label}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
        </svg>
      </button>

      {open && (
        <div className="charroi-hf-panel" role="menu">
          <input
            type="search"
            className="charroi-hf-search"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="charroi-hf-list">
            {visibleValues.length === 0 ? (
              <div className="charroi-hf-empty">Aucune valeur</div>
            ) : (
              visibleValues.map((value) => (
                <label key={value || '—'} className="charroi-hf-item">
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={() => toggleValue(value)}
                  />
                  <span>{value || '—'}</span>
                </label>
              ))
            )}
          </div>
          <div className="charroi-hf-footer">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange([])}
              disabled={!active}
            >
              Effacer
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
