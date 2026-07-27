'use client';

import { useEffect, useRef, useState } from 'react';
import { getDepartments } from '@/lib/documents';
import type { Employee } from '@/lib/types';
import type { EmployeeFilters } from '@/lib/employee-filters';

interface Props {
  employees: Employee[];
  filters: EmployeeFilters;
  onFiltersChange: (filters: EmployeeFilters) => void;
  resultCount: number;
  onExport?: () => void;
  extra?: React.ReactNode;
  compact?: boolean;
  splitLayout?: boolean;
}

export default function DocumentsFilterBar({
  employees,
  filters,
  onFiltersChange,
  resultCount,
  onExport,
  extra,
  compact = false,
  splitLayout = false,
}: Props) {
  const departments = getDepartments(employees);
  const hasFilter = Boolean(filters.search.trim() || filters.dept);
  const [searchOpen, setSearchOpen] = useState(Boolean(filters.search.trim()));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (filters.search.trim()) setSearchOpen(true);
  }, [filters.search]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (searchWrapRef.current?.contains(e.target as Node)) return;
      if (!filters.search.trim()) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen, filters.search]);

  const toggleSearch = () => {
    if (searchOpen && !filters.search.trim()) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  };

  const countLabel = (
    <span className="toolbar-count">
      {resultCount} employé{resultCount !== 1 ? 's' : ''}
      {hasFilter ? ' (filtré)' : ''}
    </span>
  );

  const deptSelect = (
    <select
      className="filter-select"
      value={filters.dept}
      onChange={(e) => onFiltersChange({ ...filters, dept: e.target.value })}
    >
      <option value="">Tous les départements</option>
      {departments.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );

  const exportButton = onExport ? (
    <button type="button" className="btn btn-outline btn-export btn-sm" onClick={onExport} title="Exporter Excel (filtres appliqués)">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export
    </button>
  ) : null;

  const searchInput = splitLayout ? (
    <div className="search-inline-wrap">
      <input
        ref={searchInputRef}
        type="text"
        className="search-input search-input-inline"
        placeholder="Nom, matricule, département…"
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
      />
    </div>
  ) : (
    <div
      ref={searchWrapRef}
      className={`search-expand-wrap${searchOpen ? ' search-expand-open' : ''}${filters.search.trim() ? ' search-expand-active' : ''}`}
    >
      <button
        type="button"
        className="search-toggle-btn"
        onClick={toggleSearch}
        title="Rechercher"
        aria-label="Rechercher"
        aria-expanded={searchOpen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
      </button>
      <div className="search-expand-panel">
        <input
          ref={searchInputRef}
          type="search"
          className="search-input search-input-expand"
          placeholder="Nom, matricule, département…"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !filters.search.trim()) setSearchOpen(false);
          }}
        />
      </div>
    </div>
  );

  if (splitLayout) {
    return (
      <div className="check-docs-filter-row">
        <div className="check-docs-filter-left">{searchInput}</div>
        <div className="check-docs-filter-right">
          {deptSelect}
          {extra}
          {countLabel}
        </div>
      </div>
    );
  }

  return (
    <div className={`panel-toolbar docs-filter-bar${compact ? ' docs-filter-bar-compact' : ''}`}>
      {searchInput}
      {deptSelect}
      {extra}
      {countLabel}
      {exportButton}
    </div>
  );
}
