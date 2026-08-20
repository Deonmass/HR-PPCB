/**
 * Sites d’ordre de mission — un onglet / une feuille Excel / une permission.
 * Préfixes et séparateurs calqués sur « Numeros de serie des ordre de Mission 2026 ».
 */

export const MISSION_SITE_IDS = [
  'kinshasa',
  'zamba',
  'zamba-consultant',
  'lubudi',
] as const;

export type MissionSiteId = (typeof MISSION_SITE_IDS)[number];

export interface MissionSiteConfig {
  id: MissionSiteId;
  /** Code Excel (cellule A1) : KN, ZA, ZC, LU */
  code: 'KN' | 'ZA' | 'ZC' | 'LU';
  label: string;
  sheetName: string;
  menuId: string;
  /**
   * Séparateur exact entre le préfixe et le numéro :
   * KN / ZC → espace ; ZA / LU → slash.
   */
  separator: ' ' | '/';
}

export const MISSION_SITES: readonly MissionSiteConfig[] = [
  {
    id: 'kinshasa',
    code: 'KN',
    label: 'Kinshasa',
    sheetName: 'Kinshasa',
    menuId: 'travel.mission.kinshasa',
    separator: ' ',
  },
  {
    id: 'zamba',
    code: 'ZA',
    label: 'Zamba PPC Team',
    sheetName: 'Zamba PPC Team',
    menuId: 'travel.mission.zamba',
    separator: '/',
  },
  {
    id: 'zamba-consultant',
    code: 'ZC',
    label: 'Zamba Consultant',
    sheetName: 'Zamba Consultant',
    menuId: 'travel.mission.zamba-consultant',
    separator: ' ',
  },
  {
    id: 'lubudi',
    code: 'LU',
    label: 'Lubudi',
    sheetName: 'Lubudi',
    menuId: 'travel.mission.lubudi',
    separator: '/',
  },
] as const;

export const MISSION_SITE_MENU_IDS = MISSION_SITES.map((site) => site.menuId);

export const MISSION_TARIFF_TYPES = [
  'Manager national',
  'Manager international',
  'Exco national',
  'Exco international',
  'Other national',
  'Other international',
  'Casual Driver national',
] as const;

export type MissionTariffType = (typeof MISSION_TARIFF_TYPES)[number];

export function isMissionSiteId(value: string | null | undefined): value is MissionSiteId {
  return Boolean(value && (MISSION_SITE_IDS as readonly string[]).includes(value));
}

export function getMissionSite(id: MissionSiteId): MissionSiteConfig {
  const site = MISSION_SITES.find((item) => item.id === id);
  if (!site) throw new Error(`Site ordre de mission inconnu : ${id}`);
  return site;
}

export function missionSiteByCode(code: string): MissionSiteConfig | null {
  const normalized = code.trim().toUpperCase();
  return MISSION_SITES.find((site) => site.code === normalized) ?? null;
}

export function missionSitePrefix(site: MissionSiteConfig): string {
  return `PPCB-DOC-HR-${site.code}`;
}

/**
 * Site suggéré d’après la localisation / le contrat de l’agent.
 * Consultant à Zamba → onglet Zamba Consultant ; sinon Plant/Zamba → PPC Team.
 */
export function suggestMissionSite(employee?: {
  localisation?: string;
  typeContrat?: string;
  jobTitle?: string;
  grade?: string;
}): MissionSiteId {
  const loc = `${employee?.localisation ?? ''}`.toLowerCase();
  const contract = `${employee?.typeContrat ?? ''} ${employee?.jobTitle ?? ''} ${employee?.grade ?? ''}`.toLowerCase();
  const isConsultant = contract.includes('consultant');

  if (loc.includes('lubudi')) return 'lubudi';
  if (loc.includes('kimpese') && isConsultant) return 'zamba-consultant';
  if (
    loc.includes('zamba')
    || loc.includes('plant')
    || loc.includes('malanga')
    || loc.includes('usine')
    || loc.includes('kimpese')
  ) {
    return isConsultant ? 'zamba-consultant' : 'zamba';
  }
  return 'kinshasa';
}
