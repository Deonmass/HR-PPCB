'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  CONVENTION_KEYWORDS,
  searchConventionArticles,
  type ConventionSearchHit,
} from '@/lib/convention-collective-index';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfPageUrl(page: number): string {
  return `/api/documents/convention-collective?mode=pdf#page=${page}`;
}

export default function ConventionCollectivePage() {
  const { can, isLoading } = usePermissions();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hits = useMemo(() => searchConventionArticles(query), [query]);

  const selected: ConventionSearchHit | null = useMemo(() => {
    if (!hits.length) return null;
    const found = selectedId ? hits.find((h) => h.id === selectedId) : null;
    return found || hits[0];
  }, [hits, selectedId]);

  const suggestions = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return CONVENTION_KEYWORDS.filter((kw) => {
      const hay = normalize([kw.label, ...kw.aliases].join(' '));
      return hay.includes(q) || q.split(' ').some((t) => t && hay.includes(t));
    });
  }, [query]);

  useEffect(() => {
    if (!hits.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !hits.some((h) => h.id === selectedId)) {
      setSelectedId(hits[0].id);
    }
  }, [hits, selectedId]);

  if (isLoading) return <div className="loading">Chargement...</div>;
  if (!can('documents.convention-collective', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  return (
    <div className="convention-page">
      <header className="convention-sticky">
        <div className="page-header convention-page-header">
          <div>
            <h2>Convention collective</h2>
          </div>
          <div className="page-header-actions">
            <a
              className="btn btn-secondary btn-sm"
              href="/api/documents/convention-collective?mode=pdf"
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir le PDF
            </a>
            <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
              ← Documents
            </Link>
          </div>
        </div>
      </header>

      <div className="convention-layout">
        <aside className="convention-col-search panel">
          <div className="form-group">
            <label>Mots de recherche</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex. préavis, congé, maîtrise…"
              autoComplete="off"
            />
          </div>

          {suggestions.length > 0 ? (
            <div className="convention-keyword-list">
              {suggestions.map((kw) => (
                <button
                  key={kw.id}
                  type="button"
                  className="convention-keyword-chip"
                  onClick={() => setQuery(kw.label)}
                >
                  {kw.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="convention-hit-list">
            <p className="convention-col-meta">
              {hits.length} résultat{hits.length > 1 ? 's' : ''}
              {query.trim() ? ` pour « ${query.trim()} »` : ''}
            </p>
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                className={`convention-hit-item${selected?.id === hit.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(hit.id)}
              >
                <strong>{hit.title}</strong>
                <span>{hit.category}</span>
              </button>
            ))}
            {!hits.length ? (
              <p className="docs-hub-empty">Aucune clause ne correspond.</p>
            ) : null}
          </div>
        </aside>

        <section className="convention-col-detail panel">
          {selected ? (
            <article className="convention-detail">
              <header className="convention-detail-header">
                <div>
                  <p className="convention-detail-category">{selected.category}</p>
                  <h3>{selected.title}</h3>
                </div>
                <span className="docs-hub-badge">Convention</span>
              </header>
              <p className="convention-detail-summary">{selected.summary}</p>
              <div className="convention-detail-body">
                <h4>Ce que dit la convention</h4>
                <p>{selected.body}</p>
              </div>
              {selected.keywords?.length ? (
                <p className="convention-tags">
                  {selected.keywords.map((tag) => (
                    <span key={tag} className="docs-hub-badge">{tag}</span>
                  ))}
                </p>
              ) : null}

              {selected.pages.length > 0 ? (
                <div className="convention-pdf-excerpt">
                  <div className="convention-pdf-excerpt-head">
                    <h4>Extrait du PDF</h4>
                    <span className="text-muted">
                      page{selected.pages.length > 1 ? 's' : ''}{' '}
                      {selected.pages.join(', ')}
                    </span>
                  </div>
                  {selected.pages.map((page) => (
                    <div key={`${selected.id}-p${page}`} className="convention-pdf-frame-wrap">
                      <div className="convention-pdf-frame-label">Page {page}</div>
                      <iframe
                        className="convention-pdf-frame"
                        title={`${selected.title} — page ${page}`}
                        src={pdfPageUrl(page)}
                      />
                      <a
                        className="btn btn-secondary btn-sm"
                        href={pdfPageUrl(page)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ouvrir la page {page}
                      </a>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ) : (
            <p className="docs-hub-empty">Saisissez un mot-clé pour afficher le résumé.</p>
          )}
        </section>
      </div>
    </div>
  );
}
