'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const PHONE = '(max-width: 900px)';
const GRID = '(max-width: 720px)';

const TOOLS_SELECTOR = [
  '[role="tablist"]',
  '.tabs.header-tabs',
  '.exco-main-tabs',
  '.employees-main-tabs',
  '.guest-house-subtabs',
  '.guest-house-export-group',
  '.employees-header-period',
  '.panel-toolbar',
  '.employees-toolbar',
  '.audit-hr-asof',
  '.charroi-filters',
].join(', ');

const SKIP_TABLE = [
  '.timesheet-calendar-grid',
  '.timesheet-grid-panel',
  '.compilation-sheet',
  '.exco-preview-frame',
  '.exco-preview',
  '[data-no-mobile-grid]',
].join(', ');

const anchors = new WeakMap<HTMLElement, HTMLElement>();
const parked = new Set<HTMLElement>();
const searchHomes = new WeakMap<HTMLElement, { parent: HTMLElement; next: ChildNode | null }>();
const liftedSearches = new Set<HTMLElement>();

function isPhone() {
  return window.matchMedia(PHONE).matches;
}

function isGrid() {
  return window.matchMedia(GRID).matches;
}

function headerLabel(th: Element): string {
  const marked = th.getAttribute('data-label');
  if (marked) return marked.trim();
  const named = th.querySelector('.table-hf-label, .th-label');
  const raw = (named?.textContent || th.textContent || '').replace(/\s+/g, ' ').trim();
  return raw.slice(0, 42);
}

function tagDataTables() {
  const root = document.querySelector('.main');
  if (!root) return;
  const grid = isGrid();
  root.querySelectorAll('table').forEach((table) => {
    if (table.closest(SKIP_TABLE)) return;
    const inWrap = Boolean(table.closest('.table-wrap, .employees-table-wrap, .data-table'));
    if (!inWrap && !table.classList.contains('data-table')) return;
    const heads = [...table.querySelectorAll('thead th')];
    if (!grid || heads.length < 2 || heads.length > 14) {
      table.classList.remove('mobile-data-grid');
      return;
    }
    const labels = heads.map(headerLabel);
    table.classList.add('mobile-data-grid');
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((cell, index) => {
        if (!(cell instanceof HTMLElement) || cell.tagName !== 'TD') return;
        const label = labels[index] || '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      });
    });
  });
}

function isTool(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('table, thead, .modal, .modal-overlay, .home-chart-panel, .sidebar')) return false;
  if (el.matches(TOOLS_SELECTOR)) return true;
  if (el.querySelector(TOOLS_SELECTOR)) return false;
  const cls = el.className;
  if (typeof cls !== 'string') return false;
  return /(?:^|\s)[\w-]*(?:toolbar|filters)(?:[\w-]*|\s|$)/.test(cls)
    && Boolean(el.querySelector('input, select'))
    && !el.closest('.home-chart-panel, .sidebar');
}

function collectTools(slot: HTMLElement | null): HTMLElement[] {
  const roots = [document.querySelector('.main'), slot].filter((node): node is HTMLElement => node instanceof HTMLElement);
  const all: HTMLElement[] = [];
  roots.forEach((root) => {
    const fromDrawer = root === slot;
    const take = (el: Element) => {
      if (!isTool(el)) return;
      if (fromDrawer && !isLiveParked(el)) return;
      all.push(el);
    };
    root.querySelectorAll(TOOLS_SELECTOR).forEach(take);
    root.querySelectorAll('[class*="toolbar"], [class*="filters"]').forEach(take);
  });
  const unique = [...new Set(all)];
  return unique.filter((el) => !unique.some((other) => other !== el && other.contains(el)));
}

function restore(el: HTMLElement) {
  const anchor = anchors.get(el);
  if (anchor?.isConnected) {
    anchor.before(el);
    anchor.remove();
  } else {
    el.remove();
    anchor?.remove();
  }
  anchors.delete(el);
  parked.delete(el);
  el.removeAttribute('data-tool-kind');
  el.removeAttribute('data-tool-path');
}

function park(el: HTMLElement, slot: HTMLElement, kind: 'tabs' | 'filters' | 'actions', pathname: string) {
  if (!anchors.has(el) || !anchors.get(el)?.isConnected) {
    anchors.get(el)?.remove();
    const anchor = document.createElement('span');
    anchor.className = 'mobile-tools-anchor';
    anchor.hidden = true;
    if (el.parentElement) el.before(anchor);
    anchors.set(el, anchor);
  }
  el.dataset.toolKind = kind;
  el.dataset.toolPath = pathname;
  if (el.parentElement !== slot) slot.appendChild(el);
  parked.add(el);
}

function isLiveParked(el: HTMLElement): boolean {
  return parked.has(el) && Boolean(anchors.get(el)?.isConnected);
}

const OPENER_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none"/></svg>';

function kindOf(el: HTMLElement): 'tabs' | 'filters' {
  if (el.matches('[role="tablist"], .tabs, .exco-main-tabs, .employees-main-tabs, .guest-house-subtabs')) {
    return 'tabs';
  }
  return 'filters';
}

function searchHost(input: HTMLElement): HTMLElement {
  const wrap = input.closest('.search-expand-wrap');
  return wrap instanceof HTMLElement ? wrap : input;
}

function hasDrawerFilter(el: HTMLElement): boolean {
  return [...el.querySelectorAll('select, textarea, input')].some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches('input[type="search"], input.search-input')) return false;
    if (node.closest('.search-expand-wrap')) return false;
    return true;
  });
}

function restoreSearches() {
  for (const block of [...liftedSearches]) {
    const home = searchHomes.get(block);
    liftedSearches.delete(block);
    searchHomes.delete(block);
    block.classList.remove('mobile-page-search');
    if (!home?.parent.isConnected) {
      block.remove();
      continue;
    }
    const next = home.next;
    if (next && next.parentNode === home.parent) home.parent.insertBefore(block, next);
    else home.parent.appendChild(block);
  }
}

function headerToolsRow(header: HTMLElement): HTMLElement {
  let row = header.querySelector<HTMLElement>(':scope > .mobile-header-tools');
  if (!row) {
    row = document.createElement('div');
    row.className = 'mobile-header-tools';
    const title = header.firstElementChild;
    if (title) title.after(row);
    else header.appendChild(row);
  }
  return row;
}

function mountSearch(block: HTMLElement) {
  const header = document.querySelector<HTMLElement>('.main .page-header');
  if (!header) return;
  if (!searchHomes.has(block) && block.parentElement && !block.classList.contains('mobile-page-search')) {
    searchHomes.set(block, { parent: block.parentElement, next: block.nextSibling });
  }
  const row = headerToolsRow(header);
  const button = row.querySelector('.mobile-tools-btn');
  if (button) {
    if (block.parentElement !== row || block.nextElementSibling !== button) button.before(block);
  } else if (block.parentElement !== row) {
    row.appendChild(block);
  }
  block.classList.add('mobile-page-search');
  liftedSearches.add(block);
}

function liftSearches(tool: HTMLElement) {
  const inputs = [...tool.querySelectorAll<HTMLElement>('input[type="search"], input.search-input')];
  const blocks = [...new Set(inputs.map(searchHost))].filter((block) => block !== tool && tool.contains(block));
  blocks.forEach(mountSearch);
}

function mountPageSearches() {
  const main = document.querySelector('.main');
  if (!(main instanceof HTMLElement)) return;
  const inputs = [...main.querySelectorAll<HTMLElement>('input[type="search"], input.search-input')];
  const blocks = [...new Set(inputs.map(searchHost))].filter((block) => {
    if (block.closest('.modal, .modal-overlay, .sidebar, .mobile-tools-drawer')) return false;
    return Boolean(block.closest('.page-header, .panel-toolbar, .employees-toolbar, .contractants-emp-list-toolbar, .search-expand-wrap, [class*="toolbar"], [class*="filters"]'));
  });
  blocks.forEach(mountSearch);
}

function clearHeaderTools() {
  document.querySelectorAll('.mobile-header-tools').forEach((row) => {
    if (!row.querySelector('.mobile-page-search, .mobile-tools-btn')) row.remove();
  });
}

function collectActions(roots: HTMLElement[], tools: HTMLElement[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  roots.forEach((root) => {
    const selector = root.classList.contains('mobile-tools-drawer-body')
      ? '.btn, .btn-icon-refresh'
      : '.page-header button';
    const fromDrawer = root.classList.contains('mobile-tools-drawer-body');
    root.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (fromDrawer && !isLiveParked(node)) return;
      if (node.classList.contains('mobile-tools-btn')) return;
      if (!node.matches('.btn, .btn-icon-refresh, .btn-with-icon')) return;
      if (node.closest('table, thead, .modal, .modal-overlay')) return;
      if (tools.some((tool) => tool === node || tool.contains(node))) return;
      found.push(node);
    });
  });
  return found;
}

function placeOpener(visible: boolean) {
  const current = document.querySelector<HTMLButtonElement>('.mobile-tools-btn');
  if (!visible || !isPhone()) {
    current?.remove();
    return;
  }
  const header = document.querySelector<HTMLElement>('.main .page-header');
  if (!header) {
    current?.remove();
    clearHeaderTools();
    return;
  }
  let button = current;
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-tools-btn';
    button.setAttribute('aria-label', 'Onglets, filtres et actions');
    button.innerHTML = OPENER_ICON;
    button.addEventListener('click', () => {
      window.dispatchEvent(new Event('ppc-toggle-tools'));
    });
  }
  const row = headerToolsRow(header);
  if (button.parentElement !== row) row.appendChild(button);
}

function dropStale(pathname: string) {
  for (const block of [...liftedSearches]) {
    const home = searchHomes.get(block);
    const parentGone = !home?.parent.isConnected;
    const otherPage = Boolean(home?.parent.dataset.toolPath && home.parent.dataset.toolPath !== pathname);
    if (!parentGone && !otherPage) continue;
    block.remove();
    liftedSearches.delete(block);
    searchHomes.delete(block);
  }
  for (const el of [...parked]) {
    const anchor = anchors.get(el);
    const otherPage = Boolean(el.dataset.toolPath && el.dataset.toolPath !== pathname);
    if (el.isConnected && anchor?.isConnected && !otherPage) continue;
    restore(el);
  }
}

function sweep(slot: HTMLElement | null) {
  if (!slot) return;
  [...slot.children].forEach((node) => {
    if (node instanceof HTMLElement && !parked.has(node)) node.remove();
  });
}

function syncTools(sections: { tabs: HTMLElement | null; filters: HTMLElement | null; actions: HTMLElement | null }, pathname: string) {
  dropStale(pathname);
  const phone = isPhone();
  const drawer = sections.tabs?.closest('.mobile-tools-drawer-body');
  if (!phone || !sections.tabs || !sections.filters || !sections.actions || !(drawer instanceof HTMLElement)) {
    restoreSearches();
    for (const el of [...parked]) restore(el);
    placeOpener(false);
    clearHeaderTools();
    return;
  }
  const roots = [document.querySelector('.main'), drawer].filter((node): node is HTMLElement => node instanceof HTMLElement);
  const tools = collectTools(drawer);
  const actions = collectActions(roots, tools);
  const tabs = tools.filter((el) => kindOf(el) === 'tabs');
  const filters = tools.filter((el) => kindOf(el) === 'filters' && hasDrawerFilter(el));
  const keep = new Set<HTMLElement>([...tabs, ...filters, ...actions]);
  for (const el of [...parked]) {
    if (!keep.has(el)) restore(el);
  }
  tabs.forEach((el) => park(el, sections.tabs!, 'tabs', pathname));
  filters.forEach((el) => park(el, sections.filters!, 'filters', pathname));
  filters.forEach((el) => liftSearches(el));
  mountPageSearches();
  actions.forEach((el) => park(el, sections.actions!, 'actions', pathname));
  sweep(sections.tabs);
  sweep(sections.filters);
  sweep(sections.actions);
  sections.tabs.parentElement?.toggleAttribute('hidden', tabs.length === 0);
  sections.filters.parentElement?.toggleAttribute('hidden', filters.length === 0);
  sections.actions.parentElement?.toggleAttribute('hidden', actions.length === 0);
  placeOpener(keep.size > 0);
}

/**
 * Téléphone : onglets et filtres dans un tiroir à droite,
 * tableaux de données en fiches lisibles.
 */
export default function MobileChrome() {
  const pathname = usePathname();
  const tabsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    let applying = false;
    const run = () => {
      if (applying) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        applying = true;
        try {
          tagDataTables();
          syncTools({
            tabs: tabsRef.current,
            filters: filtersRef.current,
            actions: actionsRef.current,
          }, pathname);
        } finally {
          applying = false;
        }
      });
    };
    run();
    const onToggle = () => setOpen((value) => !value);
    const onResize = () => {
      if (!isPhone()) setOpen(false);
      run();
    };
    window.addEventListener('ppc-toggle-tools', onToggle);
    window.addEventListener('resize', onResize);
    const root = document.querySelector('.main') || document.body;
    const observer = new MutationObserver(() => {
      if (!applying) run();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('ppc-toggle-tools', onToggle);
      restoreSearches();
      for (const el of [...parked]) restore(el);
      clearHeaderTools();
    };
  }, [pathname]);

  useEffect(() => {
    const slot = tabsRef.current?.closest('.mobile-tools-drawer-body');
    if (!(slot instanceof HTMLElement)) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button')) setOpen(false);
    };
    slot.addEventListener('click', onClick);
    return () => slot.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="mobile-tools-backdrop"
          aria-label="Fermer les onglets et filtres"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={`mobile-tools-drawer${open ? ' is-open' : ''}`} aria-hidden={!open} inert={open ? undefined : true}>
        <div className="mobile-tools-drawer-head">
          <strong>Onglets et filtres</strong>
          <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="mobile-tools-drawer-body">
          <section className="mobile-tools-section" hidden>
            <h3>Onglets</h3>
            <div ref={tabsRef} className="mobile-tools-section-body" />
          </section>
          <section className="mobile-tools-section" hidden>
            <h3>Filtres</h3>
            <div ref={filtersRef} className="mobile-tools-section-body" />
          </section>
          <section className="mobile-tools-section" hidden>
            <h3>Actions</h3>
            <div ref={actionsRef} className="mobile-tools-section-body" />
          </section>
        </div>
      </aside>
    </>
  );
}
