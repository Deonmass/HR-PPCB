'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/contexts/LocaleContext';
import { showError } from '@/lib/swal';

type ExportAction = 'preview' | 'pptx' | 'excel';

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
        d="M11 3h2v10.2l3.1-3.1 1.4 1.4L12 17.1 6.5 11.5l1.4-1.4L11 13.2V3zm-6 14h14v2H5v-2z"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <span className={`btn-spinner ${className || ''}`.trim()} aria-hidden="true" />;
}

async function downloadBlob(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = 'Export impossible';
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] ?? fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export default function RecrutementExportMenu({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const actions: Array<{
    id: ExportAction;
    label: string;
    Icon: (p: { className?: string }) => ReactNode;
  }> = [
    { id: 'preview', label: t('rec.export.preview'), Icon: IconEye },
    { id: 'pptx', label: t('rec.export.pptx'), Icon: IconPptx },
    { id: 'excel', label: t('rec.export.excel'), Icon: IconExcel },
  ];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openPreview = async () => {
    const res = await fetch('/api/employes/recrutement/export?format=preview');
    const type = res.headers.get('content-type') || '';
    if (!res.ok) {
      let message = t('rec.export.error');
      if (type.includes('json')) {
        try {
          const err = (await res.json()) as { error?: string };
          if (err.error) message = err.error;
        } catch {
          // ignore
        }
      }
      throw new Error(message);
    }
    setPreviewHtml(await res.text());
  };

  const run = async (action: ExportAction) => {
    if (disabled || busy) return;
    setBusy(action);
    setOpen(false);
    try {
      if (action === 'preview') {
        await openPreview();
      } else if (action === 'pptx') {
        await downloadBlob('/api/employes/recrutement/export?format=pptx', 'RECRUTEMENT.pptx');
      } else {
        await downloadBlob('/api/employes/recrutement/export?format=excel', 'RECRUTEMENT.xlsx');
      }
    } catch (e) {
      await showError(e instanceof Error ? e.message : t('rec.export.error'));
    } finally {
      setBusy(null);
    }
  };

  const TriggerIcon = busy ? Spinner : IconExport;

  const previewModal =
    previewHtml && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="exco-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rec-preview-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPreviewHtml(null);
            }}
          >
            <div className="exco-preview-modal rec-preview-modal">
              <div className="exco-preview-modal-head">
                <div>
                  <h3 id="rec-preview-title">{t('rec.export.preview')}</h3>
                  <p>Recrutement — aperçu PPTX</p>
                </div>
                <div className="exco-preview-modal-actions">
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    disabled={disabled || Boolean(busy)}
                    onClick={() => void run('pptx')}
                  >
                    {t('rec.export.pptx')}
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
                title={t('rec.export.preview')}
                srcDoc={previewHtml}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={`exco-export-menu${open ? ' is-open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="btn btn-secondary btn-sm exco-export-trigger"
          disabled={disabled || Boolean(busy)}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <TriggerIcon className="exco-export-trigger-icon" />
          {busy ? '…' : t('rec.export')}
        </button>
        {open ? (
          <div className="exco-export-dropdown" role="menu">
            {actions.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="exco-export-dropdown-item"
                disabled={Boolean(busy)}
                onClick={() => void run(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {previewModal}
    </>
  );
}
