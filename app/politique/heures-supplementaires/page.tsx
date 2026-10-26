'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PermissionGate from '@/components/PermissionGate';
import {
  HS_CONVENTION_ABATTEMENT_PAGE,
  HS_CONVENTION_TOTAL_PAGES,
  HS_POLICY_ABATTEMENT_ID,
  HS_POLICY_KEYWORDS,
  HS_POLICY_TOTAL_PAGES,
  searchHsPolicyArticles,
  type HsPolicySearchHit,
} from '@/lib/heures-sup-policy-index';
const PDF_DOWNLOAD = '/api/politique/heures-sup?mode=pdf&download=1';

const PDF_DOCS = {
  policy: {
    src: '/api/politique/heures-sup?mode=pdf',
    pages: HS_POLICY_TOTAL_PAGES,
    label: 'Politique HS',
  },
  convention: {
    src: '/api/documents/convention-collective?mode=pdf',
    pages: HS_CONVENTION_TOTAL_PAGES,
    label: 'Convention collective',
  },
} as const;

type PdfDocId = keyof typeof PDF_DOCS;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfSrc(doc: PdfDocId, page?: number): string {
  const spec = PDF_DOCS[doc];
  const p = Math.min(spec.pages, Math.max(1, page || 1));
  return `${spec.src}#page=${p}`;
}

export default function PolitiqueHeuresSupPage() {
  const [hasPdf, setHasPdf] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(HS_POLICY_ABATTEMENT_ID);
  const [pdfDoc, setPdfDoc] = useState<PdfDocId>('convention');
  const [pdfPage, setPdfPage] = useState(HS_CONVENTION_ABATTEMENT_PAGE);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const hits = useMemo(() => searchHsPolicyArticles(query), [query]);
  const selected: HsPolicySearchHit | null = useMemo(() => {
    if (!expandedId) return null;
    return hits.find((hit) => hit.id === expandedId) ?? null;
  }, [hits, expandedId]);

  const suggestions = useMemo(() => {
    const q = normalize(query);
    return HS_POLICY_KEYWORDS.filter((keyword) => {
      if (!q) return true;
      const hay = normalize([keyword.label, ...keyword.aliases].join(' '));
      if (hay.includes(q)) return true;
      return q.split(' ').filter(Boolean).some((token) => hay.includes(token));
    }).slice(0, 12);
  }, [query]);

  useEffect(() => {
    void fetch('/api/politique/heures-sup')
      .then((res) => res.json())
      .then((data) => setHasPdf(Boolean(data?.hasPdf)))
      .catch(() => setHasPdf(false));
  }, []);

  useEffect(() => {
    if (expandedId && !hits.some((hit) => hit.id === expandedId)) {
      setExpandedId(null);
    }
  }, [hits, expandedId]);

  const showDocument = (hit: HsPolicySearchHit) => {
    const doc: PdfDocId = hit.source === 'convention' ? 'convention' : 'policy';
    setPdfDoc(doc);
    if (hit.pages[0]) setPdfPage(Math.min(PDF_DOCS[doc].pages, Math.max(1, hit.pages[0])));
  };

  const applySuggestion = (label: string) => {
    setQuery(label);
    setSuggestOpen(false);
    const match = searchHsPolicyArticles(label)[0];
    setExpandedId(match?.id ?? null);
    if (match) showDocument(match);
  };

  const toggleSubject = (hit: HsPolicySearchHit) => {
    if (expandedId === hit.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(hit.id);
    showDocument(hit);
  };

  const goPdfPage = (next: number) => {
    const total = PDF_DOCS[pdfDoc].pages;
    setPdfPage(Math.min(total, Math.max(1, next)));
  };

  return (
    <PermissionGate
      menuId="politique.heures-sup"
      action="view"
      fallback={<p className="docs-hub-empty">Vous n’avez pas accès à cette politique.</p>}
    >
      <div className="convention-page politique-page">
        <header className="convention-topbar">
          <div>
            <h2>Politique sur les heures supplémentaires finale oct 25</h2>
            <p className="politique-sub">PPCB-LG-POL-HR-0032 — référence interne et convention collective.</p>
          </div>
          <div className="page-header-actions">
            {hasPdf ? (
              <a className="btn btn-secondary btn-sm" href={PDF_DOWNLOAD}>
                Télécharger le PDF
              </a>
            ) : null}
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
                  placeholder="Ex. abattement, taux 1.6, shift, 24 h…"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={suggestOpen && suggestions.length > 0}
                />
                {suggestOpen && suggestions.length > 0 ? (
                  <ul className="convention-suggest-list" role="listbox">
                    {suggestions.map((keyword) => (
                      <li key={keyword.id} role="option">
                        <button
                          type="button"
                          className="convention-suggest-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applySuggestion(keyword.label)}
                        >
                          <strong>{keyword.label}</strong>
                          {keyword.aliases[0] ? <span>{keyword.aliases[0]}</span> : null}
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
                const featured = hit.id === HS_POLICY_ABATTEMENT_ID;
                return (
                  <div
                    key={hit.id}
                    className={`convention-subject-item${open ? ' is-open' : ''}${featured ? ' is-featured' : ''}`}
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
                          <h4>{hit.source === 'convention' ? 'Ce que dit la convention' : 'Ce que dit la politique'}</h4>
                          {hit.body.split('\n').filter(Boolean).map((paragraph, index) => (
                            <p key={`${hit.id}-p${index}`}>{paragraph}</p>
                          ))}
                        </div>
                        {hit.pages.length > 0 ? (
                          <div className="convention-subject-pages">
                            {hit.pages.map((page) => (
                              <button
                                key={`${hit.id}-goto-${page}`}
                                type="button"
                                className={`convention-page-chip${pdfPage === page ? ' is-active' : ''}`}
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
              {!hits.length ? <p className="docs-hub-empty">Aucun sujet ne correspond.</p> : null}
            </div>
          </aside>

          <section className="convention-col-pdf panel">
            <div className="convention-pdf-toolbar">
              <div className="convention-pdf-toolbar-text">
                <h3>Aperçu PDF</h3>
                <p className="convention-col-meta">
                  {selected
                    ? `${PDF_DOCS[pdfDoc].label} — ${selected.title} — page ${pdfPage}`
                    : `${PDF_DOCS[pdfDoc].label} — page ${pdfPage}`}
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
                  p. {pdfPage} / {PDF_DOCS[pdfDoc].pages}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pdfPage >= PDF_DOCS[pdfDoc].pages}
                  onClick={() => goPdfPage(pdfPage + 1)}
                  aria-label="Page suivante"
                >
                  →
                </button>
              </div>
            </div>
            {hasPdf ? (
              <div className="convention-pdf-viewport">
                <iframe
                  key={`${pdfDoc}-${pdfPage}`}
                  className="convention-pdf-iframe"
                  title={pdfDoc === 'convention' ? 'Convention collective' : 'Politique heures supplémentaires'}
                  src={pdfSrc(pdfDoc, pdfPage)}
                />
              </div>
            ) : (
              <p className="docs-hub-empty">
                PDF non déposé. Placez le fichier dans
                {' '}
                <code>Excel/templates/policies/politique-heures-supplementaires-oct-25.pdf</code>
                {' '}
                pour l’afficher ici.
              </p>
            )}
          </section>
        </div>
      </div>
    </PermissionGate>
  );
}
