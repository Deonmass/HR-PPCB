/**
 * Index convention collective — source JSON :
 * data/documents/convention-collective-index.json
 */

import indexJson from '@/data/documents/convention-collective-index.json';

export interface ConventionArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  keywords: string[];
  body: string;
  /** Pages PDF 1-indexées (fichier source). */
  pages?: number[];
}

export interface ConventionKeyword {
  id: string;
  label: string;
  aliases: string[];
}

export interface ConventionIndexFile {
  source: string;
  sourceFile: string;
  extractedAt: string;
  note: string;
  totalPages?: number;
  keywords: ConventionKeyword[];
  articles: ConventionArticle[];
}

export const CONVENTION_INDEX = indexJson as ConventionIndexFile;

export const CONVENTION_ARTICLES: ConventionArticle[] = CONVENTION_INDEX.articles;

export const CONVENTION_KEYWORDS: ConventionKeyword[] = CONVENTION_INDEX.keywords;

export interface ConventionSearchHit {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  keywords: string[];
  pages: number[];
  score: number;
  snippet: string;
}

export interface ConventionNote {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
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

function toHit(article: ConventionArticle, score: number): ConventionSearchHit {
  return {
    id: article.id,
    title: article.title,
    category: article.category,
    summary: article.summary,
    body: article.body,
    keywords: article.keywords,
    pages: Array.isArray(article.pages) ? article.pages : [],
    score,
    snippet: article.summary,
  };
}

export function searchConventionArticles(
  query: string,
  limit = 50,
): ConventionSearchHit[] {
  const q = normalize(query);
  if (!q) {
    return CONVENTION_ARTICLES.slice(0, limit).map((article) => toHit(article, 0));
  }
  const tokens = q.split(' ').filter(Boolean);
  const hits: ConventionSearchHit[] = [];
  for (const article of CONVENTION_ARTICLES) {
    const hay = normalize(
      [article.title, article.category, article.summary, article.body, ...article.keywords].join(' '),
    );
    let score = 0;
    if (hay.includes(q)) score += 100;
    for (const token of tokens) {
      if (hay.includes(token)) score += 20;
      if (article.keywords.some((k) => normalize(k).includes(token))) score += 25;
    }
    for (const kw of CONVENTION_KEYWORDS) {
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

export function resolveKeywordQuery(keywordId: string): string {
  const kw = CONVENTION_KEYWORDS.find((item) => item.id === keywordId);
  return kw?.label || keywordId;
}
