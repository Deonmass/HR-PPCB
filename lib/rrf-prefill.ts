/** Prefill RRF cross-route (sessionStorage + query string). */

import type { RrfFormData, RrfNewOrReplacement } from './rrf-types';
import { RRF_EMPTY_FORM } from './rrf-types';

export const RRF_PREFILL_STORAGE_KEY = 'hr-rh:rrf-prefill';

export type RrfPrefillPayload = Partial<
  Pick<
    RrfFormData,
    | 'positionTitle'
    | 'jobTitle'
    | 'costCenter'
    | 'location'
    | 'reportsTo'
    | 'headcount'
    | 'jobDescription'
    | 'jobLevel'
    | 'newOrReplacement'
  >
>;

function parseNewOrReplacement(raw: string): RrfNewOrReplacement {
  const v = raw.trim();
  if (v === 'New position' || v === 'Replacement') return v;
  if (/^new/i.test(v)) return 'New position';
  if (/replace/i.test(v)) return 'Replacement';
  return '';
}

export function rrfPrefillFromSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): RrfPrefillPayload {
  const positionTitle = searchParams.get('positionTitle')?.trim() || '';
  const jobTitle = searchParams.get('jobTitle')?.trim() || positionTitle;
  const costCenter = searchParams.get('costCenter')?.trim() || '';
  const location = searchParams.get('location')?.trim() || '';
  const reportsTo = searchParams.get('reportsTo')?.trim() || '';
  const headcount = searchParams.get('headcount')?.trim() || '';
  const jobDescription = searchParams.get('jobDescription')?.trim() || '';
  const jobLevel = searchParams.get('jobLevel')?.trim() || '';
  const newOrReplacement = parseNewOrReplacement(
    searchParams.get('newOrReplacement')?.trim() || '',
  );

  const payload: RrfPrefillPayload = {};
  if (positionTitle) payload.positionTitle = positionTitle;
  if (jobTitle) payload.jobTitle = jobTitle;
  if (costCenter) payload.costCenter = costCenter;
  if (location) payload.location = location;
  if (reportsTo) payload.reportsTo = reportsTo;
  if (headcount) payload.headcount = headcount;
  if (jobDescription) payload.jobDescription = jobDescription;
  if (jobLevel) payload.jobLevel = jobLevel;
  if (newOrReplacement) payload.newOrReplacement = newOrReplacement;
  return payload;
}

export function hasRrfPrefill(payload: RrfPrefillPayload): boolean {
  return Object.keys(payload).some((k) => {
    const v = payload[k as keyof RrfPrefillPayload];
    return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
  });
}

export function writeRrfPrefill(payload: RrfPrefillPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(RRF_PREFILL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function peekRrfPrefill(): RrfPrefillPayload {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(RRF_PREFILL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RrfPrefillPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function clearRrfPrefill(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(RRF_PREFILL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Lit et consomme le prefill stocké (une seule fois). */
export function consumeRrfPrefill(): RrfPrefillPayload {
  const payload = peekRrfPrefill();
  clearRrfPrefill();
  return payload;
}

export function mergeRrfPrefill(
  base: RrfFormData,
  payload: RrfPrefillPayload,
): RrfFormData {
  if (!hasRrfPrefill(payload)) return base;
  return {
    ...base,
    positionTitle: payload.positionTitle?.trim() || base.positionTitle,
    jobTitle: payload.jobTitle?.trim() || payload.positionTitle?.trim() || base.jobTitle,
    costCenter: payload.costCenter?.trim() || base.costCenter,
    location: payload.location?.trim() || base.location,
    reportsTo: payload.reportsTo?.trim() || base.reportsTo,
    headcount: payload.headcount?.trim() || base.headcount,
    jobDescription: payload.jobDescription?.trim() || base.jobDescription,
    jobLevel: payload.jobLevel?.trim() || base.jobLevel,
    newOrReplacement:
      payload.newOrReplacement || base.newOrReplacement || 'New position',
  };
}

export function buildInitialRrfForm(): RrfFormData {
  if (typeof window === 'undefined') return { ...RRF_EMPTY_FORM };
  // peek (pas consume) pour survivre au double-mount Strict Mode
  const fromStorage = peekRrfPrefill();
  const fromUrl = rrfPrefillFromSearchParams(new URLSearchParams(window.location.search));
  return mergeRrfPrefill(
    mergeRrfPrefill({ ...RRF_EMPTY_FORM }, fromStorage),
    fromUrl,
  );
}
