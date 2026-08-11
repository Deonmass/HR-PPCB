import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { getDataBackend, isVercelRuntime } from './runtime-mode';

/** Paths inside the git repository (source of truth for users / permissions / settings). */
export const DURABLE_USERS_KEY = 'data/auth/users.json';
export const DURABLE_PERMISSIONS_KEY = 'data/auth/permissions.json';
export const DURABLE_DEPARTMENTS_KEY = 'data/settings/departments.json';
export const DURABLE_COST_CENTERS_KEY = 'data/settings/cost-centers.json';
/** @deprecated Params.xlsx deleted — settings live under data/settings/*.json. */
export const DURABLE_PARAMS_KEY = 'data/settings/departments.json';
export const DURABLE_GUEST_HOUSE_KEY = 'data/guest-house/store.json';
export const DURABLE_EMPLOYEES_KEY = 'data/employees/employees.json';
export const DURABLE_EMPLOYEE_EXITS_KEY = 'data/employees/exits.json';
export const DURABLE_CHECK_DOCUMENTS_KEY = 'data/employees/check-documents.json';
export const DURABLE_POSTES_VACANTS_KEY = 'data/employees/postes-vacants.json';
export const DURABLE_MOUVEMENTS_KEY = 'data/employees/mouvements.json';
export const DURABLE_DEPENDANTS_KEY = 'data/dependants/dependants.json';
export const DURABLE_VILLAGE_MAISONS_KEY = 'data/village/maisons.json';
export const DURABLE_VILLAGE_TAILLES_KEY = 'data/village/tailles.json';
export const DURABLE_VILLAGE_AFFECTATION_HISTORY_KEY = 'data/village/affectation-history.json';
export const DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY = 'data/village/affectation-suggestions.json';
export const DURABLE_FACTURES_SUIVI_KEY = 'data/factures-fournisseurs/factures.json';
export const DURABLE_FOURNISSEURS_KEY = 'data/factures-fournisseurs/fournisseurs.json';
export const DURABLE_PROJECTS_KEY = 'data/projects/projects.json';
export const DURABLE_PROJECT_EXPENSES_KEY = 'data/projects/expenses.json';
export const DURABLE_OVERTIMES_TIMESHEETS_KEY = 'data/overtimes/timesheets.json';
export const DURABLE_OVERTIMES_WEEKLY_KEY = 'data/overtimes/weekly-overtime.json';
export const DURABLE_TRAVEL_HISTORY_KEY = 'data/travel/history.json';
export const DURABLE_CHARROI_VEHICLES_KEY = 'data/charroi/vehicles.json';
export const DURABLE_CHARROI_ACHATS_KEY = 'data/charroi/achats.json';
export const DURABLE_AUDIT_LOGS_KEY = 'data/logs/audit.json';
export const DURABLE_WORK_VISAS_KEY = 'data/protocol/work-visas/store.json';
export const DURABLE_EXIT_ISSUED_KEY = 'data/documents/exit-issued.json';
export const DURABLE_RRF_HISTORY_KEY = 'data/documents/rrf-history.json';
export const DURABLE_CONVENTION_NOTES_KEY = 'data/documents/convention-collective-notes.json';

interface GithubRepoTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  tokenSource: 'HR_GITHUB_TOKEN';
}

function sanitizeToken(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function resolveGithubTarget(): GithubRepoTarget | null {
  // ONLY HR_GITHUB_TOKEN — never fall back to GITHUB_TOKEN (often revoked / wrong on Vercel).
  const raw = (process.env.HR_GITHUB_TOKEN || '').trim();
  const token = sanitizeToken(raw);
  if (!token) return null;

  const fromEnv = (process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || '').trim();
  let owner = (process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || '').trim();
  let repo = (process.env.GITHUB_REPO_NAME || process.env.VERCEL_GIT_REPO_SLUG || '').trim();

  if (fromEnv.includes('/')) {
    const [o, r] = fromEnv.split('/');
    owner = owner || o;
    repo = repo || r;
  }

  if (!owner || !repo) {
    owner = owner || 'Deonmass';
    repo = repo || 'HR-PPCB';
  }

  const branch = (
    process.env.GITHUB_BRANCH
    || process.env.VERCEL_GIT_COMMIT_REF
    || 'main'
  ).trim() || 'main';

  return { owner, repo, branch, token, tokenSource: 'HR_GITHUB_TOKEN' };
}

export function needsDurableRemote(): boolean {
  return getDataBackend() === 'tmp';
}

export function isDurableRemoteEnabled(): boolean {
  return needsDurableRemote() && Boolean(resolveGithubTarget());
}

export function assertDurableRemoteConfigured(action = 'sauvegarder'): void {
  if (!needsDurableRemote()) return;
  if (isDurableRemoteEnabled()) return;
  throw new Error(
    `Impossible de ${action} dans Excel/ sur Vercel : HR_GITHUB_TOKEN manquant. `
      + 'Ajoutez uniquement HR_GITHUB_TOKEN (pas GITHUB_TOKEN), Production + Preview, sans guillemets, puis Redeploy.',
  );
}

function formatGithubHttpError(action: string, repoPath: string, status: number, body: string): Error {
  if (status === 401) {
    return new Error(
      `GitHub ${action} ${repoPath} : 401 Bad credentials. `
        + '1) Supprimez GITHUB_TOKEN dans Vercel. '
        + '2) Créez un NOUVEAU fine-grained token (Contents: Read and write sur Deonmass/HR-PPCB). '
        + '3) Mettez-le dans HR_GITHUB_TOKEN seulement (valeur qui commence par github_pat_). '
        + '4) Redeploy. L’ancien token affiché à l’écran est invalide s’il a été révoqué.',
    );
  }
  if (status === 403) {
    return new Error(
      `GitHub ${action} ${repoPath} : 403 accès refusé. `
        + 'Sur le token fine-grained : Repository access = Deonmass/HR-PPCB, Contents = Read and write.',
    );
  }
  return new Error(`GitHub ${action} ${repoPath} échouée (${status}): ${body.slice(0, 200)}`);
}

async function githubRequest(
  target: GithubRepoTarget,
  apiPath: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://api.github.com${apiPath}`, {
    // Jamais de cache (Next Data Cache / proxies) : on veut toujours l'état GitHub actuel.
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${target.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hr-rh-app-durable',
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Dernière sha GitHub connue par fichier (hydratée ou persistée) dans cette instance.
 * Évite de ré-écraser la copie locale (fraîchement écrite) avec une version distante identique.
 */
const knownRemoteSha = new Map<string, string>();

/** Public diagnostic for admins (no secret leaked). */
export async function probeDurableGithub(): Promise<{
  needed: boolean;
  configured: boolean;
  tokenSource: string | null;
  tokenPrefix: string | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  authOk: boolean;
  login: string | null;
  repoOk: boolean;
  error: string | null;
}> {
  const needed = needsDurableRemote();
  const target = resolveGithubTarget();
  if (!needed) {
    return {
      needed: false,
      configured: true,
      tokenSource: null,
      tokenPrefix: null,
      owner: null,
      repo: null,
      branch: null,
      authOk: true,
      login: null,
      repoOk: true,
      error: null,
    };
  }
  if (!target) {
    return {
      needed: true,
      configured: false,
      tokenSource: null,
      tokenPrefix: null,
      owner: null,
      repo: null,
      branch: null,
      authOk: false,
      login: null,
      repoOk: false,
      error: 'HR_GITHUB_TOKEN absent au runtime (ajoutez-le puis Redeploy)',
    };
  }

  const tokenPrefix = target.token.slice(0, 11);
  const userRes = await githubRequest(target, '/user');
  if (!userRes.ok) {
    const text = await userRes.text();
    return {
      needed: true,
      configured: true,
      tokenSource: target.tokenSource,
      tokenPrefix,
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      authOk: false,
      login: null,
      repoOk: false,
      error: `Auth GitHub ${userRes.status}: ${text.slice(0, 120)}`,
    };
  }
  const userJson = (await userRes.json()) as { login?: string };
  const repoRes = await githubRequest(
    target,
    `/repos/${target.owner}/${target.repo}`,
  );
  return {
    needed: true,
    configured: true,
    tokenSource: target.tokenSource,
    tokenPrefix,
    owner: target.owner,
    repo: target.repo,
    branch: target.branch,
    authOk: true,
    login: userJson.login ?? null,
    repoOk: repoRes.ok,
    error: repoRes.ok ? null : `Repo ${target.owner}/${target.repo} inaccessible (${repoRes.status})`,
  };
}

/** Métadonnées du fichier (sha + contenu inline si < 1 Mo) — sans téléchargement séparé. */
async function readGithubFileMeta(
  target: GithubRepoTarget,
  repoPath: string,
): Promise<{ sha: string; inline?: Buffer } | null> {
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const res = await githubRequest(
    target,
    `/repos/${target.owner}/${target.repo}/contents/${encodedPath}?ref=${encodeURIComponent(target.branch)}`,
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw formatGithubHttpError('lecture', repoPath, res.status, text);
  }

  const json = (await res.json()) as { content?: string; encoding?: string; sha?: string };
  return {
    sha: json.sha || '',
    inline: json.content && json.encoding === 'base64'
      ? Buffer.from(json.content.replace(/\n/g, ''), 'base64')
      : undefined,
  };
}

/**
 * Lit un blob par sha via l'API GitHub (contenu immuable — toujours frais).
 * Remplace l'ancien téléchargement via `download_url` (raw.githubusercontent.com),
 * dont le cache CDN ~5 min renvoyait l'ancienne version juste après une écriture.
 */
async function readGithubBlob(
  target: GithubRepoTarget,
  repoPath: string,
  sha: string,
): Promise<Buffer> {
  const blobRes = await githubRequest(
    target,
    `/repos/${target.owner}/${target.repo}/git/blobs/${sha}`,
    { headers: { Accept: 'application/vnd.github.raw' } },
  );
  if (!blobRes.ok) {
    const text = await blobRes.text();
    throw formatGithubHttpError('download', repoPath, blobRes.status, text);
  }
  return Buffer.from(await blobRes.arrayBuffer());
}

async function extractContentSha(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { content?: { sha?: string } };
    return json.content?.sha || '';
  } catch {
    return '';
  }
}

/** Écrit le fichier sur GitHub et retourne la sha du nouveau contenu. */
async function writeGithubFile(
  target: GithubRepoTarget,
  repoPath: string,
  buffer: Buffer,
  message: string,
): Promise<string> {
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const existing = await readGithubFileMeta(target, repoPath);

  const body: Record<string, string> = {
    message,
    content: buffer.toString('base64'),
    branch: target.branch,
  };
  if (existing?.sha) body.sha = existing.sha;

  const res = await githubRequest(
    target,
    `/repos/${target.owner}/${target.repo}/contents/${encodedPath}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (res.status === 409) {
    const latest = await readGithubFileMeta(target, repoPath);
    if (latest?.sha) body.sha = latest.sha;
    const retry = await githubRequest(
      target,
      `/repos/${target.owner}/${target.repo}/contents/${encodedPath}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!retry.ok) {
      const text = await retry.text();
      throw formatGithubHttpError('écriture', repoPath, retry.status, text);
    }
    return extractContentSha(retry);
  }

  if (!res.ok) {
    const text = await res.text();
    throw formatGithubHttpError('écriture', repoPath, res.status, text);
  }
  return extractContentSha(res);
}

export async function hydrateDurableFile(repoPath: string, localPath: string): Promise<void> {
  if (!isDurableRemoteEnabled()) return;
  const target = resolveGithubTarget();
  if (!target) return;

  try {
    const meta = await readGithubFileMeta(target, repoPath);
    if (!meta) return;
    // La copie locale correspond déjà à cette sha (souvent : on vient de la
    // persister depuis cette instance) — ne pas la ré-écraser inutilement.
    if (meta.sha && knownRemoteSha.get(repoPath) === meta.sha && fs.existsSync(localPath)) {
      return;
    }
    const buffer = meta.inline ?? (await readGithubBlob(target, repoPath, meta.sha));
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    if (meta.sha) knownRemoteSha.set(repoPath, meta.sha);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[durable-fs] hydrate failed', repoPath, message);
  }
}

export async function persistDurableFile(repoPath: string, localPath: string): Promise<void> {
  if (!needsDurableRemote()) return;

  assertDurableRemoteConfigured('persister');
  const target = resolveGithubTarget();
  if (!target) return;

  if (!target.token.startsWith('github_pat_') && !target.token.startsWith('ghp_')) {
    throw new Error(
      'HR_GITHUB_TOKEN ne ressemble pas à un token GitHub (doit commencer par github_pat_ ou ghp_). '
        + 'Vérifiez la valeur collée dans Vercel (sans guillemets), puis Redeploy.',
    );
  }

  const body = await fsPromises.readFile(localPath);
  const label = path.basename(repoPath);
  const newSha = await writeGithubFile(
    target,
    repoPath,
    body,
    `chore(data): update ${label} from RH app${isVercelRuntime() ? ' (Vercel)' : ''}`,
  );
  // Mémorise la sha écrite : les prochaines hydratations de cette instance
  // sauront que la copie locale est déjà à jour.
  if (newSha) knownRemoteSha.set(repoPath, newSha);
}
