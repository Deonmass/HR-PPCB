import type {
  WorkVisaAlertLevel,
  WorkVisaDocStatus,
  WorkVisaValidity,
} from './work-visa-types';
import { WORK_VISA_ALERT_DAYS } from './work-visa-types';

const CONGOLESE_RE =
  /^(congolaise?|rdc|r\.?\s*d\.?\s*c\.?|cd|congo|congolese|democratic republic of (the )?congo|république démocratique du congo)$/i;

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateOnly(value: string | undefined | null): Date | null {
  const raw = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysUntil(expiryDate: string, today = todayIsoDate()): number | null {
  const expiry = parseIsoDateOnly(expiryDate);
  const ref = parseIsoDateOnly(today);
  if (!expiry || !ref) return null;
  return Math.round((expiry.getTime() - ref.getTime()) / 86_400_000);
}

export function inferIsExpat(nationalite: string): boolean {
  const n = nationalite.trim();
  if (!n) return false;
  return !CONGOLESE_RE.test(n);
}

export function computeValidity(
  expiryDate: string | undefined | null,
  today = todayIsoDate(),
): WorkVisaValidity {
  if (!expiryDate?.trim()) {
    return {
      daysRemaining: null,
      label: '—',
      status: 'absent',
      alertLevel: 'none',
      alert: false,
    };
  }

  const days = daysUntil(expiryDate, today);
  if (days == null) {
    return {
      daysRemaining: null,
      label: '—',
      status: 'absent',
      alertLevel: 'none',
      alert: false,
    };
  }

  let status: WorkVisaDocStatus = 'actif';
  let label: string;
  let alertLevel: WorkVisaAlertLevel = 'none';

  if (days < 0) {
    status = 'expire';
    label = 'Expiré';
    alertLevel = 'expired';
  } else if (days === 0) {
    status = 'expire';
    label = "Expire aujourd'hui";
    alertLevel = 'today';
  } else {
    label = `${days} j`;
    if (days <= WORK_VISA_ALERT_DAYS.m1) alertLevel = 'm1';
    else if (days <= WORK_VISA_ALERT_DAYS.m2) alertLevel = 'm2';
    else if (days <= WORK_VISA_ALERT_DAYS.m3) alertLevel = 'm3';
    else if (days <= WORK_VISA_ALERT_DAYS.m4) alertLevel = 'm4';
  }

  const alert =
    alertLevel === 'today'
    || alertLevel === 'expired'
    || alertLevel === 'm1'
    || alertLevel === 'm2'
    || alertLevel === 'm3'
    || alertLevel === 'm4';

  return { daysRemaining: days, label, status, alertLevel, alert };
}

export function formatDateFr(value: string | undefined | null): string {
  const raw = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

export function alertLevelLabel(level: WorkVisaAlertLevel): string {
  switch (level) {
    case 'm4':
      return '≤ 4 mois';
    case 'm3':
      return '≤ 3 mois';
    case 'm2':
      return '≤ 2 mois';
    case 'm1':
      return '≤ 1 mois';
    case 'today':
      return "Expire aujourd'hui";
    case 'expired':
      return 'Expiré';
    default:
      return '';
  }
}
