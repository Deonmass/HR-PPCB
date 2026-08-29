'use client';

import { useMemo, useState } from 'react';
import {
  getByPath,
  isBoolMap,
  isPlainObject,
  looksLikeMenuList,
  rowTitle,
  setByPath,
  tableColumns,
} from '@/lib/admin-json-shape';

interface ViewsProps {
  rows: Record<string, unknown>[];
  canEdit: boolean;
  onRowsChange: (rows: Record<string, unknown>[]) => void;
  rowSearch: string;
}

function toInputValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseCell(raw: string, previous: unknown): unknown {
  if (typeof previous === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : previous;
  }
  if (typeof previous === 'boolean') return raw === 'true' || raw === '1';
  if (previous == null && /^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
  return raw;
}

function FieldInput({
  value,
  canEdit,
  onChange,
}: {
  value: unknown;
  canEdit: boolean;
  onChange: (next: unknown) => void;
}) {
  if (typeof value === 'boolean') {
    return (
      <label className="admin-json-toggle">
        <input
          type="checkbox"
          checked={value}
          disabled={!canEdit}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value ? 'Oui' : 'Non'}</span>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <input
        type="number"
        className="admin-json-field-input"
        value={Number.isFinite(value) ? value : ''}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  }
  const text = value == null ? '' : String(value);
  const long = text.length > 80 || text.includes('\n');
  if (long) {
    return (
      <textarea
        className="admin-json-field-input is-area"
        rows={3}
        value={text}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type="text"
      className="admin-json-field-input"
      value={text}
      disabled={!canEdit}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ActionsChecks({
  actions,
  canEdit,
  onChange,
}: {
  actions: Record<string, boolean>;
  canEdit: boolean;
  onChange: (next: Record<string, boolean>) => void;
}) {
  return (
    <div className="admin-json-actions">
      {Object.entries(actions).map(([key, on]) => (
        <label key={key} className="admin-json-toggle">
          <input
            type="checkbox"
            checked={on}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...actions, [key]: e.target.checked })}
          />
          <span>{key}</span>
        </label>
      ))}
    </div>
  );
}

function MenuMatrix({
  menus,
  canEdit,
  onChange,
}: {
  menus: Record<string, unknown>[];
  canEdit: boolean;
  onChange: (next: Record<string, unknown>[]) => void;
}) {
  const actionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const menu of menus) {
      if (isBoolMap(menu.actions)) Object.keys(menu.actions).forEach((k) => keys.add(k));
    }
    return [...keys];
  }, [menus]);

  return (
    <div className="admin-json-matrix-wrap">
      <table className="admin-json-matrix">
        <thead>
          <tr>
            <th>Menu</th>
            {actionKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {menus.map((menu, index) => (
            <tr key={String(menu.menuId || index)}>
              <td>
                <strong>{String(menu.label || menu.menuId || `Menu ${index + 1}`)}</strong>
                <span className="admin-json-muted">{String(menu.menuId || '')}</span>
              </td>
              {actionKeys.map((key) => {
                const actions = isBoolMap(menu.actions) ? menu.actions : {};
                return (
                  <td key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(actions[key])}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = menus.map((item, i) => {
                          if (i !== index) return item;
                          const current = isBoolMap(item.actions) ? item.actions : {};
                          return { ...item, actions: { ...current, [key]: e.target.checked } };
                        });
                        onChange(next);
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EasyObject({
  row,
  canEdit,
  onChange,
}: {
  row: Record<string, unknown>;
  canEdit: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <div className="admin-json-fields">
      {Object.entries(row).map(([key, value]) => {
        if (looksLikeMenuList(value)) {
          return (
            <div key={key} className="admin-json-field is-block">
              <span className="admin-json-label">{key}</span>
              <MenuMatrix
                menus={value}
                canEdit={canEdit}
                onChange={(next) => onChange({ ...row, [key]: next })}
              />
            </div>
          );
        }
        if (isBoolMap(value)) {
          return (
            <div key={key} className="admin-json-field is-block">
              <span className="admin-json-label">{key}</span>
              <ActionsChecks
                actions={value}
                canEdit={canEdit}
                onChange={(next) => onChange({ ...row, [key]: next })}
              />
            </div>
          );
        }
        if (isPlainObject(value)) {
          return (
            <div key={key} className="admin-json-field is-block">
              <span className="admin-json-label">{key}</span>
              <EasyObject
                row={value}
                canEdit={canEdit}
                onChange={(next) => onChange({ ...row, [key]: next })}
              />
            </div>
          );
        }
        if (Array.isArray(value)) {
          return (
            <div key={key} className="admin-json-field is-block">
              <span className="admin-json-label">{key}</span>
              <span className="admin-json-muted">
                {value.length} élément{value.length > 1 ? 's' : ''} — détail dans l’onglet JSON
              </span>
            </div>
          );
        }
        return (
          <label key={key} className="admin-json-field">
            <span className="admin-json-label">{key}</span>
            <FieldInput
              value={value}
              canEdit={canEdit}
              onChange={(next) => onChange({ ...row, [key]: next })}
            />
          </label>
        );
      })}
    </div>
  );
}

export function AdminJsonEasyView({ rows, canEdit, onRowsChange, rowSearch }: ViewsProps) {
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const filtered = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    if (!q) return rows.map((row, index) => ({ row, index }));
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, rowSearch]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="admin-json-easy">
      <div className="admin-json-pager">
        <span>{filtered.length} fiche{filtered.length > 1 ? 's' : ''}</span>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>←</button>
          <span>p. {safePage + 1} / {pageCount}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      </div>
      {slice.map(({ row, index }) => (
        <article key={`${index}-${rowTitle(row, index)}`} className="admin-json-card">
          <header>
            <h4>{rowTitle(row, index)}</h4>
            {canEdit ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
              >
                Retirer
              </button>
            ) : null}
          </header>
          <EasyObject
            row={row}
            canEdit={canEdit}
            onChange={(next) => onRowsChange(rows.map((item, i) => (i === index ? next : item)))}
          />
        </article>
      ))}
      {!slice.length ? <p className="docs-hub-empty">Aucune fiche ne correspond.</p> : null}
    </div>
  );
}

export function AdminJsonTableView({ rows, canEdit, onRowsChange, rowSearch }: ViewsProps) {
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const columns = useMemo(() => tableColumns(rows), [rows]);
  const filtered = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    if (!q) return rows.map((row, index) => ({ row, index }));
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => columns.some((col) => String(getByPath(row, col) ?? '').toLowerCase().includes(q)));
  }, [rows, rowSearch, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="admin-json-table-wrap">
      <div className="admin-json-pager">
        <span>{filtered.length} ligne{filtered.length > 1 ? 's' : ''} · {columns.length} colonnes</span>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>←</button>
          <span>p. {safePage + 1} / {pageCount}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      </div>
      <div className="admin-json-table-scroll">
        <table className="admin-json-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(({ row, index }) => (
              <tr key={index}>
                {columns.map((col) => {
                  const value = getByPath(row, col);
                  if (typeof value === 'boolean') {
                    return (
                      <td key={col}>
                        <input
                          type="checkbox"
                          checked={value}
                          disabled={!canEdit}
                          onChange={(e) => {
                            onRowsChange(rows.map((item, i) => (i === index ? setByPath(item, col, e.target.checked) : item)));
                          }}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={col}>
                      <input
                        className="admin-json-cell"
                        value={toInputValue(value)}
                        disabled={!canEdit}
                        onChange={(e) => {
                          onRowsChange(rows.map((item, i) =>
                            (i === index ? setByPath(item, col, parseCell(e.target.value, value)) : item)));
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!slice.length ? <p className="docs-hub-empty">Aucune ligne à afficher.</p> : null}
      </div>
    </div>
  );
}

export function AdminJsonObjectView({
  data,
  canEdit,
  onChange,
}: {
  data: Record<string, unknown>;
  canEdit: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <div className="admin-json-easy">
      <article className="admin-json-card">
        <header>
          <h4>Propriétés</h4>
        </header>
        <EasyObject row={data} canEdit={canEdit} onChange={onChange} />
      </article>
    </div>
  );
}
