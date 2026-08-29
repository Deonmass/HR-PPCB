'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HomeSearchResult } from '@/lib/home-dashboard-types';
import { useI18n } from '@/contexts/LocaleContext';
import type { MessageKey } from '@/lib/i18n';

const TYPE_KEY: Record<HomeSearchResult['type'], MessageKey> = {
  module: 'home.search.type.module',
  employee: 'home.search.type.employee',
  vehicle: 'home.search.type.vehicle',
  project: 'home.search.type.project',
  travel: 'home.search.type.travel',
  page: 'home.search.type.page',
};

export default function HomeGlobalSearch() {
  const router = useRouter();
  const { t } = useI18n();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HomeSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!expanded || q.length < 1) {
      setResults([]);
      setLoading(false);
      if (q.length < 1) setOpen(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(() => {
      void fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((json: { results?: HomeSearchResult[] }) => {
          setResults(Array.isArray(json.results) ? json.results : []);
          setActiveIndex(0);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query, expanded]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
        if (!query.trim()) setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [query]);

  const expand = () => {
    setExpanded(true);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  };

  const collapse = () => {
    setExpanded(false);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const go = (href: string) => {
    setOpen(false);
    setExpanded(false);
    setQuery('');
    setResults([]);
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (query) {
        setQuery('');
        setResults([]);
        setOpen(false);
        return;
      }
      collapse();
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter') && results.length) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex].href);
    }
  };

  const showList = expanded && open && query.trim().length >= 1;

  return (
    <div
      className={`home-global-search${expanded ? ' is-expanded' : ''}${showList ? ' has-list' : ''}`}
      ref={wrapRef}
    >
      <div className={`home-global-search-field${expanded ? ' is-expanded' : ''}${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="home-global-search-toggle"
          aria-label={expanded ? t('home.search.label') : t('home.search.open')}
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) inputRef.current?.focus();
            else expand();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t('home.search.placeholder')}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showList}
          tabIndex={expanded ? 0 : -1}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
        />
        {loading && <span className="home-global-search-spinner" aria-hidden />}
        {expanded && query && !loading && (
          <button
            type="button"
            className="home-global-search-clear"
            aria-label={t('common.clear')}
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {showList && (
        <ul id={listId} className="home-global-search-list" role="listbox">
          {results.length === 0 && !loading ? (
            <li className="home-global-search-empty">{t('home.search.empty', { query: query.trim() })}</li>
          ) : (
            results.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`home-global-search-item${index === activeIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(item.href)}
                >
                  <span className={`home-search-type home-search-type-${item.type}`}>
                    {item.meta || t(TYPE_KEY[item.type])}
                  </span>
                  <span className="home-search-text">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
