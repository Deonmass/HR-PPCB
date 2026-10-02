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
