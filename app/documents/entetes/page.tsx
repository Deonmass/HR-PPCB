'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { showError, showSuccess } from '@/lib/swal';

interface LetterheadItem {
  id: string;
  label: string;
  company: string;
  description: string;
  fileName: string;
  downloadName: string;
  exists: boolean;
  sizeBytes: number | null;
  updatedAt: string | null;
}

function formatSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EntetesPage() {
  const { can } = usePermissions();
  const canEdit = can('documents.entetes', 'edit');
  const [items, setItems] = useState<LetterheadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/documents/entetes');
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        await showError((json as { error?: string } | null)?.error || 'Chargement impossible');
        setItems([]);
        return;
      }
      setItems(Array.isArray(json) ? json : []);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (item: LetterheadItem) => {
    if (!item.exists) {
      await showError('Fichier manquant — remplacez le modèle d’abord.');
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/documents/entetes?id=${encodeURIComponent(item.id)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error((json as { error?: string } | null)?.error || 'Téléchargement impossible');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Téléchargement impossible');
    } finally {
      setBusyId(null);
    }
  };

  const openReplace = (id: string) => {
    replaceTargetRef.current = id;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const id = replaceTargetRef.current;
    event.target.value = '';
    replaceTargetRef.current = null;
    if (!file || !id) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      await showError('Seuls les fichiers .docx sont acceptés');
      return;
    }

    setBusyId(id);
    try {
      const body = new FormData();
      body.set('id', id);
      body.set('file', file);
      const res = await fetch('/api/documents/entetes', { method: 'PUT', body });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error || 'Remplacement impossible');
      }
      await showSuccess('Modèle remplacé');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Remplacement impossible');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'documents.entetes', action: 'view' },
        { menuId: 'documents.entetes', action: 'export' },
        { menuId: 'documents.exit', action: 'view' },
        { menuId: 'travel.historique', action: 'view' },
        { menuId: 'documents.appraisal', action: 'view' },
      ]}
    >
      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <>
          <div className="page-header">
            <div>
              <div className="page-header-title-row">
                <h2>Entête</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>
                Téléchargez les papiers à en-tête (Manuco, Quarryco). Les administrateurs peuvent
                remplacer le fichier en cas de mise à jour.
              </p>
            </div>
            <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
              ← Documents
            </Link>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            onChange={(e) => void handleFileChange(e)}
          />

          <div className="entetes-grid">
            {items.map((item) => (
              <article
                key={item.id}
                className={`panel entete-card${item.exists ? '' : ' is-missing'}`}
              >
                <div className="entete-card-head">
                  <span className="entete-card-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <path d="M8 13h8M8 17h5" />
                    </svg>
                  </span>
                  <div>
                    <h3>{item.label}</h3>
                    <p className="text-muted">{item.description}</p>
                  </div>
                </div>
                <dl className="entete-meta">
                  <div>
                    <dt>Société</dt>
                    <dd>{item.company}</dd>
                  </div>
                  <div>
                    <dt>Fichier</dt>
                    <dd title={item.fileName}>{item.fileName}</dd>
                  </div>
                  <div>
                    <dt>Taille</dt>
                    <dd>{item.exists ? formatSize(item.sizeBytes) : 'Manquant'}</dd>
                  </div>
                  <div>
                    <dt>Mise à jour</dt>
                    <dd>{formatDate(item.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="entete-card-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!item.exists || busyId === item.id}
                    onClick={() => void handleDownload(item)}
                  >
                    {busyId === item.id ? '…' : 'Télécharger'}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === item.id}
                      onClick={() => openReplace(item.id)}
                      title="Remplacer par une nouvelle version .docx"
                    >
                      Remplacer
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {items.length === 0 && (
            <p className="docs-hub-empty">Aucun en-tête configuré.</p>
          )}
        </>
      )}
    </PermissionGate>
  );
}
