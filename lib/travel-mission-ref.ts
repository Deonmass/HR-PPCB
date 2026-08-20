import {
  getMissionSite,
  isMissionSiteId,
  missionSiteByCode,
  missionSitePrefix,
  type MissionSiteId,
} from './travel-mission-sites';

export type { MissionSiteId };

/** Ancien préfixe unique (Zamba PPC Team) — conservé pour les refs déjà émises. */
export const MISSION_REF_PREFIX = 'PPCB-DOC-HR-ZA';

const PPCB_REF_PATTERN =
  /^PPCB-DOC-HR-([A-Z]{2})([ /])(\d{1,3})\/(\d{2})\/(\d{4})$/i;
const OM_REF_PATTERN =
  /^OM\s*N[°ºo]?\s*(\d{1,3})\/MDS\/KPS\/ADM\/(\d{2})\/(\d{4})$/i;

export interface ParsedMissionRef {
  site: MissionSiteId;
  sequence: number;
  month: number;
  year: number;
  format: 'ppcb' | 'om';
}

function padSeq(sequence: number): string {
  return String(Math.max(1, sequence)).padStart(3, '0');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formate la référence exactement comme dans le registre Excel :
 * - Kinshasa : `PPCB-DOC-HR-KN 001/08/2026` (espace)
 * - Zamba PPC Team : `PPCB-DOC-HR-ZA/001/08/2026` (slash)
 * - Zamba Consultant : `PPCB-DOC-HR-ZC 001/08/2026` (espace)
 * - Lubudi : `PPCB-DOC-HR-LU/001/08/2026` (slash)
 */
export function formatMissionRef(
  siteId: MissionSiteId,
  sequence: number,
  date: Date = new Date(),
): string {
  const site = getMissionSite(siteId);
  const seq = padSeq(sequence);
  const month = pad2(date.getMonth() + 1);
  const year = String(date.getFullYear());
  return `${missionSitePrefix(site)}${site.separator}${seq}/${month}/${year}`;
}

export function parseMissionRef(ref: string): ParsedMissionRef | null {
  const trimmed = ref.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  const ppcb = trimmed.match(PPCB_REF_PATTERN);
  if (ppcb) {
    const site = missionSiteByCode(ppcb[1]);
    if (!site) return null;
    return {
      site: site.id,
      sequence: Number.parseInt(ppcb[3], 10),
      month: Number.parseInt(ppcb[4], 10),
      year: Number.parseInt(ppcb[5], 10),
      format: 'ppcb',
    };
  }

  const om = trimmed.match(OM_REF_PATTERN);
  if (om) {
    return {
      site: 'zamba-consultant',
      sequence: Number.parseInt(om[1], 10),
      month: Number.parseInt(om[2], 10),
      year: Number.parseInt(om[3], 10),
      format: 'om',
    };
  }

  return null;
}

export function inferMissionSiteFromRef(ref: string): MissionSiteId | null {
  return parseMissionRef(ref)?.site ?? null;
}

/**
 * Prochain numéro : séquence annuelle par site (comme le registre Excel),
 * pas de reset au changement de mois.
 */
export function nextMissionSequence(
  existingRefs: string[],
  siteId: MissionSiteId,
  date: Date = new Date(),
): number {
  if (!isMissionSiteId(siteId)) return 1;
  const year = date.getFullYear();
  let max = 0;
  for (const ref of existingRefs) {
    const parsed = parseMissionRef(ref);
    if (!parsed || parsed.site !== siteId || parsed.year !== year) continue;
    max = Math.max(max, parsed.sequence);
  }
  return max + 1;
}

export function buildNextMissionRef(
  existingRefs: string[],
  siteId: MissionSiteId,
  date: Date = new Date(),
): string {
  return formatMissionRef(siteId, nextMissionSequence(existingRefs, siteId, date), date);
}
