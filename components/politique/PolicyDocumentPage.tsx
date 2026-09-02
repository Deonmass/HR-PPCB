'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  getPolitiqueDoc,
  getPolitiqueDocIndex,
  searchPolitiqueArticles,
  type PolitiqueSearchHit,
} from '@/lib/politique-docs';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfSrc(slug: string, page?: number): string {
  const base = `/api/politique/docs/${encodeURIComponent(slug)}?mode=pdf`;
  const p = Math.max(1, page || 1);
  return `${base}#page=${p}`;
}

export default function PolicyDocumentPage({ slug }: { slug: string }) {
  const { can, isLoading } = usePermissions();
  const doc = getPolitiqueDoc(slug);
  const index = getPolitiqueDocIndex(slug);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const canView = doc ? can(doc.menuId, 'view') : false;
  const totalPages = index?.totalPages || doc?.totalPages || 1;

  const hits = useMemo(
    () => (index ? searchPolitiqueArticles(index, query) : []),
    [index, query],
  );

  const selected: PolitiqueSearchHit | null = useMemo(() => {
    if (!expandedId) return null;
    return hits.find((h) => h.id === expandedId) ?? null;
  }, [hits, expandedId]);

  const suggestions = useMemo(() => {
    if (!index) return [];
    const q = normalize(query);
    return index.keywords
      .filter((kw) => {
        if (!q) return true;
        const hay = normalize([kw.label, ...kw.aliases].join(' '));
        if (hay.includes(q)) return true;
        return q.split(' ').filter(Boolean).some((t) => hay.includes(t));
      })
      .slice(0, 12);
  }, [index, query]);

  useEffect(() => {
    if (expandedId && !hits.some((h) => h.id === expandedId)) {
      setExpandedId(null);
    }
  }, [hits, expandedId]);

  const applySuggestion = (label: string) => {
    setQuery(label);
    setSuggestOpen(false);
    setExpandedId(null);
  };

  const toggleSubject = (hit: PolitiqueSearchHit) => {
    if (expandedId === hit.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(hit.id);
    if (hit.pages[0]) setPdfPage(hit.pages[0]);
  };

  const goPdfPage = (next: number) => {
    setPdfPage(Math.min(totalPages, Math.max(1, next)));
  };

  if (isLoading) return <div className="loading">Chargement...</div>;
  if (!doc || !index) {
    return <p className="docs-hub-empty">Document introuvable.</p>;
  }
  if (!canView) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  return (
    <div className="convention-page">
      <header className="convention-topbar">
        <h2>{doc.title}</h2>
        <div className="page-header-actions">
          <a
            className="btn btn-secondary btn-sm"
            href={`/api/politique/docs/${encodeURIComponent(doc.slug)}?mode=pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir le PDF
          </a>
          <Link href="/politique" className="btn btn-secondary btn-sm" prefetch={false}>
            ← Politique
          </Link>
        </div>
      </header>

      <div className="convention-layout">
        <aside className="convention-col-subjects panel">
          <div className="form-group convention-search-field">
            <label>Rechercher un sujet</label>
            <div className="convention-suggest-wrap">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSuggestOpen(false), 150);
                }}
                placeholder={
                  doc.searchable
                    ? 'Ex. allocation, twins, inspection, pets…'
                    : 'Filtrer les pages…'
                }
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={suggestOpen && suggestions.length > 0}
              />
              {suggestOpen && suggestions.length > 0 ? (
                <ul className="convention-suggest-list" role="listbox">
                  {suggestions.map((kw) => (
                    <li key={kw.id} role="option">
                      <button
                        type="button"
                        className="convention-suggest-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(kw.label)}
                      >
                        <strong>{kw.label}</strong>
                        {kw.aliases[0] ? <span>{kw.aliases[0]}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <p className="convention-col-meta">
            {hits.length} sujet{hits.length > 1 ? 's' : ''}
            {query.trim() ? ` pour « ${query.trim()} »` : ''}
          </p>

          <div className="convention-subject-list" role="list">
            {hits.map((hit) => {
              const open = expandedId === hit.id;
              return (
                <div
                  key={hit.id}
                  className={`convention-subject-item${open ? ' is-open' : ''}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="convention-subject-toggle"
                    aria-expanded={open}
                    onClick={() => toggleSubject(hit)}
                  >
                    <span className="convention-subject-toggle-text">
                      <strong>{hit.title}</strong>
                      <span>{hit.category}</span>
                    </span>
                    <span className="convention-subject-chevron" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                  </button>

                  {open ? (
                    <div className="convention-subject-collapse">
                      <p className="convention-subject-summary">{hit.summary}</p>
                      <div className="convention-detail-body">
                        <h4>Ce que dit la politique</h4>
                        {hit.body.split('\n').filter(Boolean).map((paragraph, idx) => (
                          <p key={`${hit.id}-p${idx}`}>{paragraph}</p>
                        ))}
                      </div>
                      {hit.pages.length > 0 ? (
                        <div className="convention-subject-pages">
                          {hit.pages.map((page) => (
                            <button
                              key={`${hit.id}-goto-${page}`}
                              type="button"
                              className={`convention-page-chip${
                                pdfPage === page ? ' is-active' : ''
                              }`}
                              onClick={() => goPdfPage(page)}
                            >
                              Page {page}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!hits.length ? (
              <p className="docs-hub-empty">Aucun sujet ne correspond.</p>
            ) : null}
          </div>
        </aside>

        <section className="convention-col-pdf panel">
          <div className="convention-pdf-toolbar">
            <div className="convention-pdf-toolbar-text">
              <h3>Aperçu PDF</h3>
              <p className="convention-col-meta">
                {selected ? `${selected.title} — page ${pdfPage}` : `Page ${pdfPage}`}
              </p>
            </div>
            <div className="convention-pdf-nav">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pdfPage <= 1}
                onClick={() => goPdfPage(pdfPage - 1)}
                aria-label="Page précédente"
              >
                ←
              </button>
              <span className="convention-pdf-page-label">
                p. {pdfPage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pdfPage >= totalPages}
                onClick={() => goPdfPage(pdfPage + 1)}
                aria-label="Page suivante"
              >
                →
              </button>
            </div>
          </div>
          <div className="convention-pdf-viewport">
            <iframe
              key={pdfPage}
              className="convention-pdf-iframe"
              title={selected ? `${selected.title} — page ${pdfPage}` : `${doc.title} — page ${pdfPage}`}
              src={pdfSrc(doc.slug, pdfPage)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
