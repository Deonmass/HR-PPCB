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

/** Termine et masque la barre. */
export function completeTopProgress() {
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
    completeTopProgress();
  }, [pathname, searchParams]);

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
