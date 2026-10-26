import { POLICY_RULES } from './timesheet-compilation-policy';
import { TIMESHEET_POLICY_SECTIONS } from './timesheet-policy';

export const HS_POLICY_TOTAL_PAGES = 6;
export const HS_CONVENTION_TOTAL_PAGES = 41;
/** Page du PDF de la convention : 40 h/semaine, HS à partir de la 43e heure. */
export const HS_CONVENTION_ABATTEMENT_PAGE = 29;
export const HS_POLICY_ABATTEMENT_ID = 'abattement';

export interface HsPolicyKeyword {
  id: string;
  label: string;
  aliases: string[];
}

export interface HsPolicyArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  keywords: string[];
  body: string;
  pages?: number[];
  /** Document affiché quand le sujet est choisi. */
  source?: 'policy' | 'convention';
}

export const HS_POLICY_KEYWORDS: HsPolicyKeyword[] = [
  { id: 'abattement', label: 'Abattement', aliases: ['abattement', '2h', 'deux heures', 'convention', 'syndicat', '1.6'] },
  { id: 'taux-13', label: 'Taux 1.3', aliases: ['1.3', '130', 'plafond', '2h'] },
  { id: 'taux-16', label: 'Taux 1.6', aliases: ['1.6', '160'] },
  { id: 'taux-2', label: 'Taux 2', aliases: ['200', 'week-end', 'férié', 'ferie'] },
  { id: 'shifts', label: 'Shifts', aliases: ['shift', 'horaire', 'morning', 'after', 'night', 'général'] },
  { id: 'nuit', label: 'Heures de nuit', aliases: ['nuit', '19h', '22h', '05h'] },
  { id: 'plafond', label: 'Plafond 24 h', aliases: ['24', '12 heures', 'protocole', 'maximum'] },
  { id: 'exclusions', label: 'Exclusions', aliases: ['c5', 'e4', 'cec', 'conducteurs', 'journaliers', 'vente'] },
  { id: 'objet', label: 'Objet', aliases: ['objet', 'législation', 'rémunération'] },
  { id: 'application', label: 'Champ d’application', aliases: ['application', 'employés', 'droit du travail'] },
];

const capRule = POLICY_RULES.find((rule) => rule.id === 'cap-ot13');
const abattementRule = POLICY_RULES.find((rule) => rule.id === 'deduction-ot16');

const timesheetArticles: HsPolicyArticle[] = TIMESHEET_POLICY_SECTIONS.filter((section) => section.title !== 'Abattement conventionnel').map((section) => ({
  id: section.title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
  title: section.title,
  category: 'Timesheet',
  summary: section.items[0] || section.title,
  keywords: section.items,
  body: section.items.join('\n'),
}));

const documentArticles: HsPolicyArticle[] = [
  {
    id: 'objet',
    title: 'Objet',
    category: 'Document',
    summary: 'Pourvoir les opérations, respecter la loi et rémunérer les heures supplémentaires de façon cohérente.',
    keywords: ['objet', 'législation', 'rémunération', 'opérations'],
    pages: [1],
    body: '1.1 S’assurer que l’ensemble des opérations soit adéquatement pourvu en personnel et fonctionne de manière optimale.\n1.2 Assurer le respect de la législation pertinente.\n1.3 Assurer la cohérence dans la rémunération des heures supplémentaires effectuées.',
  },
  {
    id: 'champ',
    title: 'Champ d’application et exclusions',
    category: 'Document',
    summary: 'Tous les employés PPC Barnet, sauf direction, grades C4 autonomes, vente, CEC, conducteurs et journaliers.',
    keywords: ['champ', 'exclusion', 'c5', 'e4', 'c4', 'cec', 'conducteurs', 'journaliers', 'vente'],
    pages: [1],
    body: 'La politique s’applique à tous les employés de PPC Barnet, conformément au droit du travail de la RDC.\nElle ne s’applique pas à l’équipe de direction (grades C5 à E4), au personnel autonome de grade C4, au personnel de vente, à l’équipe du Centre d’excellence client, aux conducteurs, ni aux travailleurs journaliers ou occasionnels.',
  },
  {
    id: 'definitions',
    title: 'Définitions',
    category: 'Document',
    summary: 'Heures normales, heures supplémentaires convenues avec la direction, repos et journée.',
    keywords: ['définition', 'heures normales', 'repos', 'accord'],
    pages: [1],
    body: 'Heures de travail normales : heures stipulées au contrat.\nHeures supplémentaires : heures travaillées au-delà, par accord entre la direction et l’employé.\nPériode de repos : jour de congé selon l’horaire officiel.',
  },
  {
    id: 'plafond-24',
    title: 'Accord, pause et plafond de 24 h',
    category: 'Document',
    summary: 'La pause déjeuner n’est pas du temps de travail. La loi plafonne à 12 h ; le protocole du 21 octobre 2022 porte le maximum à 24 h par semaine.',
    keywords: ['24', '12', 'protocole', 'pause', 'accord', 'syndicat', '21 octobre 2022'],
    pages: [2],
    body: 'La pause déjeuner n’est pas comptabilisée : le salarié n’est pas à la disposition de l’employeur.\nLes heures supplémentaires exigent un accord entre le salarié et la direction.\nLa loi limite les heures supplémentaires à 12 heures par semaine. Le protocole d’accord du 21 octobre 2022, signé avec la délégation syndicale, fixe le maximum à 24 heures par semaine (annexes 1 et 2).\nLe chef de service envoie le tableau de service aux RH au plus tard le 5e jour avant la fin du mois.',
  },
  {
    id: 'regime-fixe',
    title: 'Régime fixe à 60 %',
    category: 'Document',
    summary: 'Certains postes reçoivent un forfait : 36 h par mois du lundi au samedi, ou 30 h du lundi au vendredi, payées à 60 %.',
    keywords: ['60', '36', '30', 'forfait', 'samedi'],
    pages: [3],
    body: 'Pour les postes difficiles à contrôler, la société ne pointe pas les heures réellement faites. Un forfait est payé au taux de 60 % : 36 heures par mois pour le lundi–samedi, 30 heures pour le lundi–vendredi.\nCe régime cesse si l’employé change de poste. Il est imposable et doit être approuvé par le membre de l’ExCo responsable, le chef des ressources humaines et le chef de la direction.',
  },
  {
    id: 'confidentialite',
    title: 'Confidentialité et conformité',
    category: 'Document',
    summary: 'La politique ne se divulgue pas à des tiers. Le non-respect peut entraîner une sanction disciplinaire.',
    keywords: ['confidentialité', 'conformité', 'sanction', 'disciplinaire'],
    pages: [3],
    body: 'Les données commerciales de PPC et cette politique ne se divulguent pas à des tiers, sauf les personnes visées au champ d’application.\nLe non-respect peut entraîner des sanctions disciplinaires.',
  },
  {
    id: 'annexes',
    title: 'Annexes du protocole',
    category: 'Document',
    summary: 'Annexes 1 et 2 du protocole d’accord sur les heures supplémentaires.',
    keywords: ['annexe', 'protocole', 'signature'],
    pages: [5, 6],
    body: 'L’annexe 1 est en page 5 et l’annexe 2 en page 6. Elles accompagnent le protocole qui porte le plafond hebdomadaire à 24 heures.',
  },
];

export const HS_POLICY_ARTICLES: HsPolicyArticle[] = [
  {
    id: HS_POLICY_ABATTEMENT_ID,
    title: abattementRule?.title || 'Abattement conventionnel de 2h',
    category: 'Convention collective',
    summary: 'Semaine de 40 h. Les heures supplémentaires ne sont comptées qu’à partir de la 43e heure : les 2 h d’écart ne sont pas payées.',
    keywords: ['abattement', '2h', '43e', '40 heures', 'convention', 'durée du travail'],
    pages: [HS_CONVENTION_ABATTEMENT_PAGE],
    source: 'convention',
    body: [
      abattementRule?.description
        || 'Par convention avec le syndicat, un abattement de 2h est appliqué chaque semaine.',
      'Convention collective, durée du travail : 40 heures par semaine, du lundi au vendredi. Les heures supplémentaires sont comptabilisées à partir de la 43e heure.',
    ].join('\n\n'),
  },
  {
    id: 'plafond-13',
    title: capRule?.title || 'Plafond du taux 1.3 à 2h par semaine',
    category: 'Commentaire appliqué',
    summary: 'Le taux 1.3 est plafonné à 2 h par semaine. Le surplus passe au taux 1.6.',
    keywords: ['1.3', 'plafond', '1.6', 'surplus', '2h'],
    pages: [2],
    body: capRule?.description
      || 'Le total d’heures majorées au taux 1.3 ne peut dépasser 2h par semaine.',
  },
  ...timesheetArticles,
  ...documentArticles,
];

export interface HsPolicySearchHit extends HsPolicyArticle {
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

export function searchHsPolicyArticles(query: string, limit = 40): HsPolicySearchHit[] {
  const q = normalize(query);
  const toHit = (article: HsPolicyArticle, score: number): HsPolicySearchHit => ({
    ...article,
    pages: Array.isArray(article.pages) ? article.pages : [],
    score,
  });
  if (!q) {
    return HS_POLICY_ARTICLES.slice(0, limit).map((article) => toHit(article, 0));
  }
  const tokens = q.split(' ').filter(Boolean);
  const hits: HsPolicySearchHit[] = [];
  for (const article of HS_POLICY_ARTICLES) {
    const hay = normalize(
      [article.title, article.category, article.summary, article.body, ...article.keywords].join(' '),
    );
    let score = 0;
    if (hay.includes(q)) score += 100;
    for (const token of tokens) {
      if (hay.includes(token)) score += 20;
      if (article.keywords.some((keyword) => normalize(keyword).includes(token))) score += 25;
    }
    for (const keyword of HS_POLICY_KEYWORDS) {
      const aliases = [keyword.label, ...keyword.aliases].map(normalize);
      if (aliases.some((alias) => alias && (q.includes(alias) || alias.includes(q) || tokens.some((token) => alias.includes(token))))) {
        if (hay.includes(normalize(keyword.id)) || aliases.some((alias) => hay.includes(alias))) score += 15;
      }
    }
    if (score <= 0) continue;
    hits.push(toHit(article, score));
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr')).slice(0, limit);
}
