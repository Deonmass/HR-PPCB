'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { showError, showSuccess } from '@/lib/swal';

type IoAction = 'import' | 'pptx' | 'excel';

function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M11 16h2V8.8l2.6 2.6 1.4-1.4L12 5l-5 5 1.4 1.4L11 8.8V16zm-6 4h14v2H5v-2z"
      />
    </svg>
  );
}

function IconPptx({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM8 11h5.5a2.5 2.5 0 0 1 0 5H10v2H8V11zm2 3h3.5a.5.5 0 0 0 0-1H10v1z"
      />
    </svg>
  );
}

function IconExcel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM8.2 18l2.3-3.3L8.4 11h2.2l1.3 2.1L13.2 11H15l-2.1 3.2L15.2 18H13l-1.4-2.2L10.2 18H8.2z"
      />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M11 3h2v10.2l3.1-3.1 1.4 1.4L12 17.1 6.5 11.5l1.4-1.4L11 13.2V3zm-6 14h14v2H5v-2z"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <span className={`btn-spinner ${className || ''}`.trim()} aria-hidden />;
}

async function downloadBlob(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = 'Export failed';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?([^"]+)"?/i);
  const name = match?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TrainingIoMenu({
  canImport,
  canExport,
  disabled,
  onImported,
}: {
  canImport?: boolean;
  canExport?: boolean;
  disabled?: boolean;
  onImported?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<IoAction | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allActions: Array<{
    id: IoAction;
    label: string;
    Icon: (p: { className?: string }) => ReactNode;
    show: boolean;
  }> = [
    { id: 'import', label: 'Import Trainee cost', Icon: IconUpload, show: Boolean(canImport) },
    { id: 'pptx', label: 'Export PPTX', Icon: IconPptx, show: Boolean(canExport) },
    { id: 'excel', label: 'Export Excel', Icon: IconExcel, show: Boolean(canExport) },
  ];
  const actions = allActions.filter((a) => a.show);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!actions.length) return null;

  const runImport = async (file: File) => {
    setBusy('import');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/training/import', { method: 'POST', body: fd });
      const json = (await res.json()) as {
        error?: string;
        added?: number;
        updated?: number;
      };
      if (!res.ok) throw new Error(json.error || 'Import failed');
      await onImported?.();
      await showSuccess(`Import OK — +${json.added ?? 0} / updated ${json.updated ?? 0}`);
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Import error');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async (action: IoAction) => {
    if (disabled || busy) return;
    setOpen(false);
    if (action === 'import') {
      fileRef.current?.click();
      return;
    }
    setBusy(action);
    try {
      await downloadBlob(
        `/api/training/export?format=${action}`,
        action === 'excel' ? 'TRAINING.xlsx' : 'TRAINING.pptx',
      );
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Export error');
    } finally {
      setBusy(null);
    }
  };

  const TriggerIcon = busy ? Spinner : IconMenu;

  return (
    <div className={`exco-export-menu training-io-menu${open ? ' is-open' : ''}`} ref={rootRef}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void runImport(f);
        }}
      />
      <button
        type="button"
        className="btn btn-sm training-action-btn is-menu"
        disabled={disabled || Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <TriggerIcon className="training-action-icon" />
        <span>{busy ? '…' : 'Import / Export'}</span>
        <span className="training-io-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="exco-export-dropdown training-io-dropdown" role="menu">
          {actions.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`exco-export-dropdown-item is-${id}`}
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
  );
}
