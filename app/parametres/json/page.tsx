'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import {
  AdminJsonEasyView,
  AdminJsonObjectView,
  AdminJsonTableView,
} from '@/components/admin/AdminJsonStructuredViews';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  isPlainObject,
  parseJsonText,
  replaceCollection,
  stringifyJson,
  unwrapCollection,
} from '@/lib/admin-json-shape';
import { confirmAction, showError, showSuccess } from '@/lib/swal';

interface JsonFileInfo {
  path: string;
  bytes: number;
  mtime: string | null;
  sensitive: boolean;
}

type ViewMode = 'easy' | 'table' | 'json';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AdminJsonPage() {
  const { can } = usePermissions();
  const canEdit = can('settings.permissions', 'edit');
  const [files, setFiles] = useState<JsonFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileQuery, setFileQuery] = useState('');
  const [rowQuery, setRowQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [sensitive, setSensitive] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('easy');
  const [listCollapsed, setListCollapsed] = useState(false);

  const dirty = text !== savedText;
  const parsed = useMemo(() => parseJsonText(text), [text]);
  const collection = useMemo(() => unwrapCollection(parsed.data), [parsed.data]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/json');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chargement impossible');
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (filePath: string) => {
    if (!filePath) return;
    setFileLoading(true);
    try {
      const res = await fetch(`/api/settings/json?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Lecture impossible');
      setSelected(data.path);
      setText(String(data.text || ''));
      setSavedText(String(data.text || ''));
      setParseError(data.valid ? null : String(data.parseError || 'JSON invalide'));
      setSensitive(Boolean(data.sensitive));
      setRowQuery('');
      setView('easy');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Lecture impossible');
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) => file.path.toLowerCase().includes(q));
  }, [files, fileQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, JsonFileInfo[]>();
    for (const file of filteredFiles) {
      const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '(racine)';
      const list = map.get(folder) || [];
      list.push(file);
      map.set(folder, list);
    }
    return [...map.entries()];
  }, [filteredFiles]);

  const applyData = (next: unknown) => {
    setText(stringifyJson(next));
    setParseError(null);
  };

  const openFile = async (filePath: string) => {
    if (filePath === selected) return;
    if (dirty && !(await confirmAction('Modifications non enregistrées', 'Changer de fichier sans enregistrer ?', 'Continuer'))) {
      return;
    }
    await loadFile(filePath);
  };

  const handleSave = async () => {
    if (!selected || !canEdit) return;
    try {
      JSON.parse(text);
    } catch {
      await showError('JSON invalide — corrigez le contenu avant d’enregistrer');
      return;
    }
    if (!(await confirmAction(
      'Enregistrer ce JSON ?',
      sensitive
        ? `${selected} — fichier sensible (auth). Une erreur peut bloquer la connexion.`
        : selected,
      'Enregistrer',
    ))) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Enregistrement impossible');
      setSavedText(text);
      setParseError(null);
      await showSuccess(`Enregistré — ${data.path || selected}`);
      await loadList();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Chargement...</div>;

  const showCollection = collection.rows.length > 0;
  const showObject = !showCollection && isPlainObject(parsed.data);

  return (
    <PermissionGate
      menuId="settings.permissions"
      action="view"
      fallback={<p className="docs-hub-empty">Vous n’avez pas accès à l’éditeur JSON.</p>}
    >
      <div className="admin-json-page">
        <div className="page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Fichiers JSON</h2>
              <RefreshButton onClick={() => void loadList()} loading={false} />
            </div>
            <p>Vue administrateur — fiches, tableau ou JSON brut</p>
          </div>
          {canEdit && selected ? (
            <button
              type="button"
              className="btn btn-accent"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'Enregistré'}
            </button>
          ) : null}
        </div>

        <div className={`admin-json-layout${listCollapsed ? ' is-collapsed' : ''}`}>
          <aside className="admin-json-list panel">
            <div className="admin-json-list-head">
              <div className="admin-json-list-head-row">
                <input
                  type="search"
                  className="search-input admin-json-file-search"
                  placeholder="Filtrer un fichier…"
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm admin-json-collapse"
                  onClick={() => setListCollapsed(true)}
                  title="Réduire la liste"
                  aria-label="Réduire la liste des fichiers"
                >
                  «
                </button>
              </div>
              <p className="admin-json-meta">{filteredFiles.length} fichier{filteredFiles.length > 1 ? 's' : ''}</p>
            </div>
            <div className="admin-json-groups">
              {grouped.map(([folder, items]) => (
                <div key={folder} className="admin-json-group">
                  <h3>{folder}</h3>
                  {items.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className={`admin-json-file${selected === file.path ? ' is-active' : ''}`}
                      onClick={() => void openFile(file.path)}
                    >
                      <strong>{file.path.slice(file.path.lastIndexOf('/') + 1)}</strong>
                      <span>
                        {formatBytes(file.bytes)}
                        {file.sensitive ? ' · sensible' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {!grouped.length ? <p className="docs-hub-empty">Aucun fichier.</p> : null}
            </div>
          </aside>

          <section className="admin-json-editor panel">
            {listCollapsed && !selected ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm admin-json-collapse"
                onClick={() => setListCollapsed(false)}
              >
                » Fichiers
              </button>
            ) : null}
            {!selected ? (
              <p className="docs-hub-empty">Choisissez un fichier à gauche.</p>
            ) : (
              <>
                <div className="admin-json-editor-head">
                  <div className="admin-json-editor-title">
                    {listCollapsed ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm admin-json-collapse"
                        onClick={() => setListCollapsed(false)}
                        title="Afficher la liste des fichiers"
                        aria-label="Afficher la liste des fichiers"
                      >
                        »
                      </button>
                    ) : null}
                    <div>
                      <h3>{selected}</h3>
                      {sensitive ? <p className="admin-json-warn">Fichier sensible — éditez avec précaution.</p> : null}
                      {parseError || parsed.error ? (
                        <p className="admin-json-warn">JSON invalide : {parseError || parsed.error}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="admin-json-view-tabs" role="tablist" aria-label="Mode d’affichage">
                    <button type="button" className={view === 'easy' ? 'is-active' : ''} onClick={() => setView('easy')}>Fiches</button>
                    <button type="button" className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>Tableau</button>
                    <button type="button" className={view === 'json' ? 'is-active' : ''} onClick={() => setView('json')}>JSON</button>
                  </div>
                </div>

                {view !== 'json' && showCollection ? (
                  <input
                    type="search"
                    className="search-input admin-json-row-search"
                    placeholder="Filtrer les lignes / fiches…"
                    value={rowQuery}
                    onChange={(e) => setRowQuery(e.target.value)}
                  />
                ) : null}

                {fileLoading ? (
                  <div className="loading">Chargement du fichier…</div>
                ) : view === 'json' || parsed.error ? (
                  <textarea
                    className="admin-json-textarea"
                    spellCheck={false}
                    value={text}
                    readOnly={!canEdit}
                    onChange={(e) => setText(e.target.value)}
                  />
                ) : view === 'table' && showCollection ? (
                  <AdminJsonTableView
                    rows={collection.rows}
                    canEdit={canEdit}
                    rowSearch={rowQuery}
                    onRowsChange={(rows) => applyData(replaceCollection(parsed.data, collection.wrapperKey, rows))}
                  />
                ) : view === 'easy' && showCollection ? (
                  <AdminJsonEasyView
                    rows={collection.rows}
                    canEdit={canEdit}
                    rowSearch={rowQuery}
                    onRowsChange={(rows) => applyData(replaceCollection(parsed.data, collection.wrapperKey, rows))}
                  />
                ) : showObject ? (
                  <AdminJsonObjectView
                    data={parsed.data as Record<string, unknown>}
                    canEdit={canEdit}
                    onChange={(next) => applyData(next)}
                  />
                ) : (
                  <textarea
                    className="admin-json-textarea"
                    spellCheck={false}
                    value={text}
                    readOnly={!canEdit}
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </PermissionGate>
  );
}
