'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ExportAction = 'preview' | 'pptx' | 'excel';

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
      />
    </svg>
  );
}

function IconPptx({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM8 11h5.5a2.5 2.5 0 0 1 0 5H10v2H8V11zm2 3h3.5a.5.5 0 0 0 0-1H10v1z"
      />
    </svg>
  );
}

function IconExcel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM8.2 18l2.3-3.3L8.4 11h2.2l1.3 2.1L13.2 11H15l-2.1 3.2L15.2 18H13l-1.4-2.2L10.2 18H8.2z"
      />
    </svg>
  );
}

function IconExport({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 12h14v2H5v-2zm0 4h14v2H5v-2z"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <span className={`btn-spinner ${className || ''}`.trim()} aria-hidden="true" />;
}

const ACTIONS: Array<{
  id: ExportAction;
  label: string;
  Icon: (p: { className?: string }) => ReactNode;
}> = [
  { id: 'preview', label: 'Aperçu PPTX', Icon: IconEye },
  { id: 'pptx', label: 'Export PPTX', Icon: IconPptx },
  { id: 'excel', label: 'Export Excel', Icon: IconExcel },
];

export default function ExcoExportMenu({
  year,
  month,
  disabled,
}: {
  year: number;
  month: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const periodLabel = `${MONTHS_FR[month - 1] || month} ${year}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!previewHtml) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewHtml(null);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [previewHtml]);

  const downloadBlob = async (url: string, fallbackName: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Téléchargement impossible');
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/i);
    a.href = objectUrl;
    a.download = m?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const openPreview = async () => {
    const res = await fetch(`/api/exco/preview?year=${year}&month=${month}`);
    const type = res.headers.get('content-type') || '';
    if (!res.ok) {
      const err = type.includes('json') ? await res.json().catch(() => ({})) : {};
      throw new Error((err as { error?: string }).error || 'Aperçu impossible');
    }
    if (!type.includes('text/html')) {
      throw new Error('Aperçu indisponible');
    }
    setPreviewHtml(await res.text());
  };

  const run = async (action: ExportAction) => {
    if (disabled || busy) return;
    setBusy(action);
    setOpen(false);
    try {
      const q = `year=${year}&month=${month}`;
      if (action === 'preview') {
        await openPreview();
      } else if (action === 'pptx') {
        await downloadBlob(`/api/exco/export?${q}`, `EXCO_HR_REPORT.pptx`);
      } else {
        await downloadBlob(`/api/exco/export-excel?${q}`, `EXCO_HR_REPORT.xlsx`);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Export impossible');
    } finally {
      setBusy(null);
    }
  };

  const triggerBusy = Boolean(busy);
  const TriggerIcon = busy ? Spinner : IconExport;

  const previewModal =
    previewHtml && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="exco-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exco-preview-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPreviewHtml(null);
            }}
          >
            <div className="exco-preview-modal">
              <div className="exco-preview-modal-head">
                <div>
                  <h3 id="exco-preview-title">Aperçu PPTX</h3>
                  <p>{periodLabel}</p>
                </div>
                <div className="exco-preview-modal-actions">
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    disabled={disabled || triggerBusy}
                    onClick={() => void run('pptx')}
                  >
                    Export PPTX
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPreviewHtml(null)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
              <iframe
                className="exco-preview-iframe"
                title={`Aperçu EXCO ${periodLabel}`}
                srcDoc={previewHtml}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`exco-export-menu${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="btn btn-accent btn-sm exco-export-trigger"
        disabled={disabled || triggerBusy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <TriggerIcon className="exco-export-trigger-icon" />
        <span>Export</span>
      </button>
      {open && (
        <div className="exco-export-dropdown" role="menu">
          {ACTIONS.map(({ id, label, Icon }) => {
            const itemBusy = busy === id;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="exco-export-dropdown-item"
                disabled={disabled || Boolean(busy)}
                onClick={() => void run(id)}
              >
                {itemBusy ? <Spinner /> : <Icon />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
      {previewModal}
    </div>
  );
}
