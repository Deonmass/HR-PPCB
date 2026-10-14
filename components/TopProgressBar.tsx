'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type ProgressState = {
  active: boolean;
  /** 0–100 */
  value: number;
};

type Listener = (state: ProgressState) => void;

const listeners = new Set<Listener>();
let state: ProgressState = { active: false, value: 0 };
let trickleTimer: ReturnType<typeof setInterval> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  for (const listener of listeners) listener(state);
}

function clearTrickle() {
  if (trickleTimer) {
    clearInterval(trickleTimer);
    trickleTimer = null;
  }
}

function clearHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/** Démarre la barre de progression (navigation entrante). */
export function startTopProgress() {
  clearHide();
  clearTrickle();
  state = { active: true, value: 8 };
  notify();
  trickleTimer = setInterval(() => {
    if (!state.active) return;
    // Progress asymptotically toward ~88% until completion
    const next = state.value + Math.max(0.4, (90 - state.value) * 0.08);
    state = { active: true, value: Math.min(88, next) };
    notify();
  }, 120);
}

let holds = 0;

/** Garde la barre visible le temps d’un chargement (fetch, etc.). */
export function holdTopProgress() {
  holds += 1;
  if (!state.active) startTopProgress();
}

export function releaseTopProgress() {
  holds = Math.max(0, holds - 1);
  if (holds === 0) completeTopProgress();
}

/** Termine et masque la barre. */
export function completeTopProgress() {
  if (holds > 0) return;
  clearTrickle();
  if (!state.active && state.value === 0) return;
  state = { active: true, value: 100 };
  notify();
  clearHide();
  hideTimer = setTimeout(() => {
    state = { active: false, value: 0 };
    notify();
  }, 220);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isApiRequest(url: string): boolean {
  return url.startsWith('/api/') || url.includes('/api/');
}

function useTopProgressState(): ProgressState {
  const [local, setLocal] = useState<ProgressState>(state);
  useEffect(() => {
    const listener: Listener = (next) => setLocal({ ...next });
    listeners.add(listener);
    setLocal({ ...state });
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return local;
}

/**
 * Barre fine rouge en haut de page.
 * Se complète automatiquement à chaque changement de route.
 */
export default function TopProgressBar() {
  const { active, value } = useTopProgressState();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (holds === 0) completeTopProgress();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [pathname, searchParams]);

  useEffect(() => {
    const startFromHistory = () => startTopProgress();
    const originalPush = history.pushState.bind(history);
    history.pushState = (data, unused, url) => {
      startFromHistory();
      return originalPush(data, unused, url);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a');
      if (!link) return;
      if (link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (/^https?:/i.test(href) && !href.startsWith(window.location.origin)) return;
      startTopProgress();
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const track = isApiRequest(requestUrl(input));
      if (track) holdTopProgress();
      try {
        return await originalFetch(input, init);
      } finally {
        if (track) releaseTopProgress();
      }
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', startFromHistory);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', startFromHistory);
      history.pushState = originalPush;
      window.fetch = originalFetch;
    };
  }, []);

  if (!active && value === 0) return null;

  return (
    <div
      className={`top-progress-bar${active ? ' is-active' : ''}${value >= 100 ? ' is-done' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-hidden={!active}
    >
      <div className="top-progress-bar-fill" style={{ width: `${value}%` }} />
    </div>
  );
}
