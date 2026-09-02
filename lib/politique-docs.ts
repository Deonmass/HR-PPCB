import villageIndexJson from '@/data/politique/village-index.json';

export type PolitiqueDocId =
  | 'village'
  | 'code-conduite'
  | 'code-ethique'
  | 'manuco'
  | 'aide-medicale'
  | 'voyages'
  | 'alcool'
  | 'harcelement';

export interface PolitiqueKeyword {
  id: string;
  label: string;
  aliases: string[];
}

export interface PolitiqueArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  keywords: string[];
  body: string;
  pages?: number[];
}

export interface PolitiqueDocIndex {
  source: string;
  sourceFile?: string;
  extractedAt?: string;
  note?: string;
  totalPages: number;
  keywords: PolitiqueKeyword[];
  articles: PolitiqueArticle[];
}

export interface PolitiqueDocMeta {
  id: PolitiqueDocId;
  slug: string;
  menuId: string;
  title: string;
  description: string;
  badge: string;
  accent: string;
  pdfFile: string;
  totalPages: number;
  i18nKey: string;
  searchable: boolean;
}

export const POLITIQUE_DOCS: PolitiqueDocMeta[] = [
  {
    id: 'village',
    slug: 'village',
    menuId: 'politique.village',
    title: 'Politique Village (maisons)',
    description: 'Attribution des maisons, types, obligations occupant / société et motifs d’expulsion.',
    badge: 'Logement',
    accent: '#9a3412',
    pdfFile: 'ppc-village-policy.pdf',
    totalPages: 3,
    i18nKey: 'village',
    searchable: true,
  },
  {
    id: 'code-conduite',
    slug: 'code-conduite',
    menuId: 'politique.code-conduite',
    title: 'Code de bonne conduite',
    description: 'Règles de comportement attendues des employés PPC Barnet.',
    badge: 'Éthique',
    accent: '#1e3a8a',
    pdfFile: 'code-de-bonne-conduite.pdf',
    totalPages: 7,
    i18nKey: 'conduct',
    searchable: false,
  },
  {
    id: 'code-ethique',
    slug: 'code-ethique',
    menuId: 'politique.code-ethique',
    title: 'Code de conduite et éthique des affaires',
    description: 'Politique d’éthique des affaires — version française.',
    badge: 'Éthique',
    accent: '#312e81',
    pdfFile: 'code-conduite-ethique.pdf',
    totalPages: 11,
    i18nKey: 'ethics',
    searchable: false,
  },
  {
    id: 'manuco',
    slug: 'manuco',
    menuId: 'politique.manuco',
    title: 'Règlement Manuco',
    description: 'Règlement intérieur Manuco.',
    badge: 'Règlement',
    accent: '#334155',
    pdfFile: 'manuco-reglement.pdf',
    totalPages: 7,
    i18nKey: 'manuco',
    searchable: false,
  },
  {
    id: 'aide-medicale',
    slug: 'aide-medicale',
    menuId: 'politique.aide-medicale',
    title: 'Politique d’aide médicale',
    description: 'Couverture médicale des employés — Medical Aid Policy.',
    badge: 'Santé',
    accent: '#0f766e',
    pdfFile: 'aide-medicale.pdf',
    totalPages: 5,
    i18nKey: 'medical',
    searchable: false,
  },
  {
    id: 'voyages',
    slug: 'voyages',
    menuId: 'politique.voyages',
    title: 'Politique de voyage',
    description: 'Travel Policy — version française signée.',
    badge: 'Voyage',
    accent: '#0369a1',
    pdfFile: 'politique-voyages.pdf',
    totalPages: 19,
    i18nKey: 'travel',
    searchable: false,
  },
  {
    id: 'alcool',
    slug: 'alcool',
    menuId: 'politique.alcool',
    title: 'Politique alcool et substances',
    description: 'Alcohol and substance abuse policy — version française.',
    badge: 'Santé',
    accent: '#b45309',
    pdfFile: 'alcool-substances.pdf',
    totalPages: 3,
    i18nKey: 'alcohol',
    searchable: false,
  },
  {
    id: 'harcelement',
    slug: 'harcelement',
    menuId: 'politique.harcelement',
    title: 'Politique harcèlement',
    description: 'Harassment policy — version française.',
    badge: 'Éthique',
    accent: '#9f1239',
    pdfFile: 'harcelement.pdf',
    totalPages: 3,
    i18nKey: 'harassment',
    searchable: false,
  },
];

const VILLAGE_INDEX = villageIndexJson as PolitiqueDocIndex;

export function getPolitiqueDoc(slug: string | undefined | null): PolitiqueDocMeta | undefined {
  const key = String(slug ?? '').trim().toLowerCase();
  return POLITIQUE_DOCS.find((doc) => doc.slug === key || doc.id === key);
}

export function politiqueDocMenuIds(): string[] {
  return POLITIQUE_DOCS.map((doc) => doc.menuId);
}

function scannedIndex(doc: PolitiqueDocMeta): PolitiqueDocIndex {
  const articles: PolitiqueArticle[] = [
    {
      id: 'doc',
      title: doc.title,
      category: 'Document',
      keywords: [doc.title, doc.badge],
      pages: [1],
      summary: doc.description,
      body: 'Document scanné — consultez l’aperçu PDF à droite. Cliquez une page pour y aller.',
    },
    ...Array.from({ length: doc.totalPages }, (_, i) => {
      const page = i + 1;
      return {
        id: `p${page}`,
        title: `Page ${page}`,
        category: 'Pages',
        keywords: [`page ${page}`],
        pages: [page],
        summary: `Aller à la page ${page} du PDF.`,
        body: `${doc.title} — page ${page} / ${doc.totalPages}.`,
      };
    }),
  ];
  return {
    source: doc.title,
    sourceFile: `Excel/templates/policies/${doc.pdfFile}`,
    totalPages: doc.totalPages,
    keywords: [],
    articles,
  };
}

export function getPolitiqueDocIndex(slug: string): PolitiqueDocIndex | null {
  const doc = getPolitiqueDoc(slug);
  if (!doc) return null;
  if (doc.id === 'village') return VILLAGE_INDEX;
  return scannedIndex(doc);
}

export interface PolitiqueSearchHit {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  keywords: string[];
  pages: number[];
  score: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchPolitiqueArticles(
  index: PolitiqueDocIndex,
  query: string,
  limit = 80,
): PolitiqueSearchHit[] {
  const q = normalize(query);
  const toHit = (article: PolitiqueArticle, score: number): PolitiqueSearchHit => ({
    id: article.id,
    title: article.title,
    category: article.category,
    summary: article.summary,
    body: article.body,
    keywords: article.keywords,
    pages: Array.isArray(article.pages) ? article.pages : [],
    score,
  });
  if (!q) {
    return index.articles.slice(0, limit).map((article) => toHit(article, 0));
  }
  const tokens = q.split(' ').filter(Boolean);
  const hits: PolitiqueSearchHit[] = [];
  for (const article of index.articles) {
    const hay = normalize(
      [article.title, article.category, article.summary, article.body, ...article.keywords].join(' '),
    );
    let score = 0;
    if (hay.includes(q)) score += 100;
    for (const token of tokens) {
      if (hay.includes(token)) score += 20;
      if (article.keywords.some((k) => normalize(k).includes(token))) score += 25;
    }
    for (const kw of index.keywords) {
      const aliases = [kw.label, ...kw.aliases].map(normalize);
      if (aliases.some((a) => a && (q.includes(a) || a.includes(q) || tokens.some((t) => a.includes(t))))) {
        if (hay.includes(normalize(kw.id)) || aliases.some((a) => hay.includes(a))) {
          score += 15;
        }
      }
    }
    if (score <= 0) continue;
    hits.push(toHit(article, score));
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
