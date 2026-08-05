'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  label?: string;
  min: string;
  max: string;
  onChange: (next: { min: string; max: string }) => void;
}

/** Filtre de plage km façon entonnoir (supérieur / inférieur à). */
export default function CharroiKmHeaderFilter({
  label = 'Km',
  min,
  max,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(min);
  const [draftMax, setDraftMax] = useState(max);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const active = Boolean(min.trim() || max.trim());

  useEffect(() => {
    if (!open) return;
    setDraftMin(min);
    setDraftMax(max);
  }, [open, min, max]);

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

  const apply = () => {
    onChange({ min: draftMin.trim(), max: draftMax.trim() });
    setOpen(false);
  };

  return (
    <div className="charroi-hf" ref={wrapRef}>
      <button
        type="button"
        className={`charroi-hf-btn${active ? ' active' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={active ? `${label} filtré` : `Filtrer ${label}`}
        aria-label={`Filtrer ${label}`}
      >
        <span className="charroi-hf-label">{label}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
        </svg>
      </button>

      {open && (
        <div className="charroi-hf-panel charroi-hf-panel-km" role="menu">
          <div className="charroi-hf-km-fields">
            <label>
              <span>Supérieur ou égal à</span>
              <input
                type="number"
                min={0}
                placeholder="Ex. 50000"
                value={draftMin}
                onChange={(e) => setDraftMin(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Inférieur ou égal à</span>
              <input
                type="number"
                min={0}
                placeholder="Ex. 180000"
                value={draftMax}
                onChange={(e) => setDraftMax(e.target.value)}
              />
            </label>
          </div>
          <div className="charroi-hf-footer">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDraftMin('');
                setDraftMax('');
              }}
              disabled={!draftMin && !draftMax}
            >
              Effacer
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
              Valider
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
