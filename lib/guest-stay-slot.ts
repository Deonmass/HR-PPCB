/** Créneau d'entrée ou de sortie d'un séjour Guest house. */
export const GUEST_STAY_SLOTS = ['matin', 'midi', 'soir'] as const;

export type GuestStaySlot = (typeof GUEST_STAY_SLOTS)[number];

export const GUEST_STAY_SLOT_LABELS: Record<GuestStaySlot, string> = {
  matin: 'Matin',
  midi: 'Midi',
  soir: 'Soir',
};

const SLOT_RANK: Record<GuestStaySlot, number> = {
  matin: 0,
  midi: 1,
  soir: 2,
};

export function normalizeGuestStaySlot(value: unknown, fallback: GuestStaySlot): GuestStaySlot {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'matin' || raw === 'midi' || raw === 'soir') return raw;
  return fallback;
}

export interface GuestStayBounds {
  startDate: string;
  endDate: string;
  startSlot?: GuestStaySlot | null;
  endSlot?: GuestStaySlot | null;
}

/**
 * Sans créneau enregistré, le jour reste occupé en entier
 * (entrée le matin, sortie le soir) pour ne pas libérer d'anciens séjours.
 */
export function effectiveStaySlots(item: GuestStayBounds): {
  startSlot: GuestStaySlot;
  endSlot: GuestStaySlot;
} {
  return {
    startSlot: item.startSlot ? normalizeGuestStaySlot(item.startSlot, 'matin') : 'matin',
    endSlot: item.endSlot ? normalizeGuestStaySlot(item.endSlot, 'soir') : 'soir',
  };
}

export function stayBoundRank(date: string, slot: GuestStaySlot): number {
  const day = date.slice(0, 10).replace(/-/g, '');
  const numeric = Number(day);
  if (!Number.isFinite(numeric)) return 0;
  return numeric * 3 + SLOT_RANK[slot];
}

export function isStayOrderValid(
  startDate: string,
  startSlot: GuestStaySlot,
  endDate: string,
  endSlot: GuestStaySlot,
): boolean {
  if (!startDate || !endDate) return false;
  return stayBoundRank(startDate, startSlot) <= stayBoundRank(endDate, endSlot);
}

/** Chevauchement inclusif : une sortie « matin » ne bloque pas une entrée « midi » le même jour. */
export function staysOverlap(a: GuestStayBounds, b: GuestStayBounds): boolean {
  const as = effectiveStaySlots(a);
  const bs = effectiveStaySlots(b);
  const a0 = stayBoundRank(a.startDate, as.startSlot);
  const a1 = stayBoundRank(a.endDate, as.endSlot);
  const b0 = stayBoundRank(b.startDate, bs.startSlot);
  const b1 = stayBoundRank(b.endDate, bs.endSlot);
  return a0 <= b1 && b0 <= a1;
}

/** Date locale (le fuseau du poste), pas le jour UTC. */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Créneau de l'horloge locale.
 * Matin avant 12h, midi jusqu'à 18h, soir ensuite.
 */
export function guestStaySlotAt(now: Date = new Date()): GuestStaySlot {
  const hour = now.getHours();
  if (hour < 12) return 'matin';
  if (hour < 18) return 'midi';
  return 'soir';
}

/** Le séjour couvre encore ce jour et ce créneau (sortie incluse). */
export function stayCoversMoment(item: GuestStayBounds, date: string, slot: GuestStaySlot): boolean {
  if (!item.startDate || !item.endDate) return false;
  const slots = effectiveStaySlots(item);
  const rank = stayBoundRank(date, slot);
  return stayBoundRank(item.startDate, slots.startSlot) <= rank
    && rank <= stayBoundRank(item.endDate, slots.endSlot);
}

/** Le créneau demandé est après la sortie : la chambre est libérée. */
export function stayHasEnded(item: GuestStayBounds, date: string, slot: GuestStaySlot): boolean {
  if (!item.endDate) return false;
  const slots = effectiveStaySlots(item);
  return stayBoundRank(date, slot) > stayBoundRank(item.endDate, slots.endSlot);
}
