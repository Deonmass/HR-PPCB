/** Barre de progression fine en haut (navigation SPA). */

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let activeCount = 0;
let doneTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  const active = activeCount > 0;
  listeners.forEach((fn) => fn(active));
}

export function subscribeNavProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(activeCount > 0);
  return () => {
    listeners.delete(listener);
  };
}

/** Démarre la barre (ex. avant router.push). */
export function startNavProgress(): void {
  if (typeof window === 'undefined') return;
  if (doneTimer) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
  activeCount += 1;
  emit();
  // Sécurité : fin auto si la navigation ne termine jamais
  doneTimer = setTimeout(() => {
    activeCount = 0;
    emit();
    doneTimer = null;
  }, 8000);
}

/** Termine la progression (souvent auto au changement de route). */
export function doneNavProgress(): void {
  if (typeof window === 'undefined') return;
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = null;
    }
    emit();
  }
}

export function forceDoneNavProgress(): void {
  if (typeof window === 'undefined') return;
  activeCount = 0;
  if (doneTimer) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
  emit();
}
