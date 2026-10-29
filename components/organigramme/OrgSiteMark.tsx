import type { OrgLocationZone } from '@/lib/organigramme';

const LABEL: Record<OrgLocationZone, string> = {
  usine: 'Usine',
  hq: 'HQ',
  regions: 'Régions',
};

const COLOR: Record<OrgLocationZone, string> = {
  usine: '#15803d',
  hq: '#1d4ed8',
  regions: '#c2410c',
};

/** Même repère de lieu pour Usine, HQ et Régions. La couleur distingue le site. */
export default function OrgSiteMark({ zone }: { zone: OrgLocationZone }) {
  return (
    <svg
      className={`org-site-icon is-${zone}`}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      style={{ color: COLOR[zone] }}
      aria-hidden
    >
      <title>{LABEL[zone]}</title>
      <path
        fill="currentColor"
        d="M12 1.6a7.2 7.2 0 0 0-7.2 7.2c0 5.35 7.2 13.6 7.2 13.6s7.2-8.25 7.2-13.6A7.2 7.2 0 0 0 12 1.6zm0 9.8a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"
      />
    </svg>
  );
}
