import { formatDisplayName } from './format-display-name';
import type { Employee } from './types';

export type VillageProposalBadge = 'proposal' | 'role';

export interface VillagePresentationProposal {
  id: string;
  house: string;
  name: string;
  matricule: string;
  purpose: string;
  badge: VillageProposalBadge;
}

export interface VillagePresentation {
  chromeKicker: string;
  period: string;
  cover: {
    title: string;
    date: string;
    place: string;
  };
  dashboard: {
    title: string;
    note: string;
  };
  vacant: {
    title: string;
    note: string;
  };
  proposals: {
    title: string;
    note: string;
    items: VillagePresentationProposal[];
  };
  thankYou: {
    kicker: string;
    message: string;
  };
  updatedAt?: string;
}

export type VillagePresentationLive = {
  maisonsTotal: number;
  maisonsOccupees: number;
  maisonsVides: number;
  village: number;
  villagePersonnes: number;
  kimpese: number;
  kimpesePersonnes: number;
  zamba: number;
  occPct: number;
  parTaille: Array<{ label: string; total: number; occupees: number; vides: number }>;
  tailleColumns: string[];
  parDepartementTaille: Array<{
    departement: string;
    counts: Record<string, number>;
    total: number;
  }>;
  vacant: Array<{ numero: string; type: string }>;
};

const SEED_PROPOSALS: Array<{
  id: string;
  house: string;
  matricule?: string;
  nameSearch?: string;
  name: string;
  purpose: string;
  badge: VillageProposalBadge;
}> = [
  {
    id: 'p-5',
    house: '5',
    matricule: '70000109',
    name: 'Fred Moleka Gbanga',
    purpose: 'Proposed assignment',
    badge: 'proposal',
  },
  {
    id: 'p-6',
    house: '6',
    nameSearch: 'BOMPETA',
    name: 'Erick Bompeta Mpingo',
    purpose: 'To be housed',
    badge: 'proposal',
  },
  {
    id: 'p-20',
    house: '20',
    name: 'Mechanical Foreman',
    purpose: 'Position to be filled',
    badge: 'role',
  },
  {
    id: 'p-26b',
    house: '26B',
    matricule: '70000306',
    name: 'Blanchard Muzo Nkiene',
    purpose: 'Proposed assignment',
    badge: 'proposal',
  },
  {
    id: 'p-28b',
    house: '28B',
    matricule: '70000270',
    name: 'Archipp Mulenda',
    purpose: 'Proposed assignment',
    badge: 'proposal',
  },
  {
    id: 'p-45',
    house: '45',
    name: 'Guest house',
    purpose: 'Overflow when the guest house is full',
    badge: 'role',
  },
  {
    id: 'p-61',
    house: '61',
    name: 'Mechanical Vulcanizer',
    purpose: 'Position to be filled',
    badge: 'role',
  },
];

function findEmployee(
  employees: Employee[],
  opts: { matricule?: string; nameSearch?: string },
): Employee | undefined {
  if (opts.matricule) {
    const key = opts.matricule.trim().toLowerCase();
    const byMat = employees.find((e) => e.matricule.trim().toLowerCase() === key);
    if (byMat) return byMat;
  }
  if (opts.nameSearch) {
    const needle = opts.nameSearch.trim().toLowerCase();
    return employees.find((e) => e.nom.toLowerCase().includes(needle));
  }
  return undefined;
}

export function villagePresentationCoverDate(d = new Date()): string {
  return d
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();
}

export function villagePresentationPeriod(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(' ', '-');
}

export function emptyProposal(): VillagePresentationProposal {
  return {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    house: '',
    name: '',
    matricule: '',
    purpose: '',
    badge: 'proposal',
  };
}

export function defaultVillagePresentation(employees: Employee[] = []): VillagePresentation {
  return {
    chromeKicker: 'PPC · VILLAGE',
    period: villagePresentationPeriod(),
    cover: {
      title: 'VILLAGE HOUSING BRIEFING',
      date: villagePresentationCoverDate(),
      place: 'ZAMBA',
    },
    dashboard: {
      title: 'Houses & dashboard by department',
      note: '',
    },
    vacant: {
      title: 'Vacant houses',
      note: '',
    },
    proposals: {
      title: 'Allocation proposals',
      note: 'Presentation only — these allocations are not recorded in the system.',
      items: SEED_PROPOSALS.map((seed) => {
        const emp =
          seed.badge === 'role'
            ? undefined
            : findEmployee(employees, { matricule: seed.matricule, nameSearch: seed.nameSearch });
        return {
          id: seed.id,
          house: seed.house,
          name: formatDisplayName(emp?.nom || seed.name),
          matricule: emp?.matricule || seed.matricule || '',
          purpose: seed.purpose,
          badge: seed.badge,
        };
      }),
    },
    thankYou: {
      kicker: 'PPC · VILLAGE',
      message: 'Thank You',
    },
  };
}

function str(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function normalizeVillagePresentation(
  raw: unknown,
  employees: Employee[] = [],
): VillagePresentation {
  const base = defaultVillagePresentation(employees);
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<VillagePresentation>;
  const cover = src.cover && typeof src.cover === 'object' ? src.cover : {};
  const dashboard = src.dashboard && typeof src.dashboard === 'object' ? src.dashboard : {};
  const vacant = src.vacant && typeof src.vacant === 'object' ? src.vacant : {};
  const proposals = src.proposals && typeof src.proposals === 'object' ? src.proposals : {};
  const thankYou = src.thankYou && typeof src.thankYou === 'object' ? src.thankYou : {};
  const items = Array.isArray(proposals.items) && proposals.items.length
    ? proposals.items.map((item, i) => ({
        id: str(item?.id, `p-${i + 1}`),
        house: str(item?.house),
        name: str(item?.name),
        matricule: str(item?.matricule),
        purpose: str(item?.purpose),
        badge: item?.badge === 'role' ? 'role' as const : 'proposal' as const,
      }))
    : base.proposals.items;
  return {
    chromeKicker: str(src.chromeKicker, base.chromeKicker).replace(/exco/gi, 'VILLAGE'),
    period: str(src.period, base.period),
    cover: {
      title: str(cover.title, base.cover.title),
      date: str(cover.date, base.cover.date),
      place: str(cover.place, base.cover.place),
    },
    dashboard: {
      title: str(dashboard.title, base.dashboard.title),
      note: str(dashboard.note),
    },
    vacant: {
      title: str(vacant.title, base.vacant.title),
      note: str(vacant.note),
    },
    proposals: {
      title: str(proposals.title, base.proposals.title),
      note: str(proposals.note, base.proposals.note),
      items,
    },
    thankYou: {
      kicker: str(thankYou.kicker, base.thankYou.kicker).replace(/exco/gi, 'VILLAGE'),
      message: str(thankYou.message, base.thankYou.message),
    },
    updatedAt: str(src.updatedAt) || undefined,
  };
}
