'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  label: string;
  /** Valeurs uniques disponibles (déjà triées de préférence). */
  values: string[];
  /** Valeurs cochées ([] = aucun filtre → tout). */
  selected: string[];
  onChange: (next: string[]) => void;
}

interface PanelPos {
  top: number;
  left: number;
  minWidth: number;
}

/** Filtre de colonne façon Excel : entonnoir + liste à cocher + Valider. */
export default function TableHeaderFilter({ label, values, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    setDraft(selected);
    setQuery('');
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const panelWidth = Math.max(200, Math.min(280, Math.max(rect.width, 200)));
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - panelWidth - 8);
      }
      setPos({
        top: rect.bottom + 4,
        left,
        minWidth: panelWidth,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
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
    setDraft((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const selectAllVisible = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const value of visibleValues) next.add(value);
      return [...next];
    });
  };

  const deselectAllVisible = () => {
    if (!query.trim()) {
      setDraft([]);
      return;
    }
    const hide = new Set(visibleValues);
    setDraft((prev) => prev.filter((v) => !hide.has(v)));
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="table-hf-panel table-hf-panel-portal"
            role="menu"
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          >
            <input
              type="search"
              className="table-hf-search"
              placeholder="Rechercher une valeur…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="table-hf-select-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllVisible}>
                Tout sélectionner
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={deselectAllVisible}>
                Tout désélectionner
              </button>
            </div>
            <div className="table-hf-list">
              {visibleValues.length === 0 ? (
                <div className="table-hf-empty">Aucune valeur</div>
              ) : (
                visibleValues.map((value) => (
                  <label key={value || '—'} className="table-hf-item">
                    <input
                      type="checkbox"
                      checked={draft.includes(value)}
                      onChange={() => toggleValue(value)}
                    />
                    <span>{value || '—'}</span>
                  </label>
                ))
              )}
            </div>
            <div className="table-hf-footer">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDraft([])}
                disabled={draft.length === 0}
              >
                Effacer
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
                Valider
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="table-hf">
      <button
        ref={btnRef}
        type="button"
        className={`table-hf-btn${active ? ' active' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={active ? `${label} — ${selected.length} filtre(s)` : `Filtrer ${label}`}
        aria-label={`Filtrer ${label}`}
        aria-expanded={open}
      >
        <span className="table-hf-label">{label}</span>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
        </svg>
      </button>
      {panel}
    </div>
  );
}
