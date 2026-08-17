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
export const DURABLE_CONTRACTANTS_KEY = 'data/employees/contractants.json';
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
export const DURABLE_EXCO_REPORTS_KEY = 'data/exco/reports.json';
export const DURABLE_AUDIT_HR_KEY = 'data/audit/actions.json';

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
    ...init,
    // Force no-store after init so callers cannot re-enable caching.
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hr-rh-app-durable',
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${target.token}`,
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
    },
  });
}

/**
 * Dernière sha GitHub connue par fichier (hydratée ou persistée) dans cette instance.
 * Évite de ré-écraser la copie locale (fraîchement écrite) avec une version distante identique.
 */
const knownRemoteSha = new Map<string, string>();
/** Contenu local correspondant à knownRemoteSha — base d'un merge 3-voies en cas de conflit. */
const lastHydratedContent = new Map<string, Buffer>();

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

function encodedBranchRef(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function encodedRepoPath(repoPath: string): string {
  return repoPath.split('/').map(encodeURIComponent).join('/');
}

async function githubJson<T>(
  target: GithubRepoTarget,
  apiPath: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const res = await githubRequest(target, apiPath, init);
  if (!res.ok) {
    return { ok: false, status: res.status, text: await res.text() };
  }
  return { ok: true, data: (await res.json()) as T };
}

/**
 * SHA du commit HEAD via l'API Git refs — pas Contents `?ref=branch`,
 * dont le cache renvoyait un SHA périmé et provoquait le 409.
 */
async function getHeadCommitSha(target: GithubRepoTarget): Promise<string> {
  const ref = encodedBranchRef(target.branch);
  const result = await githubJson<{ object?: { sha?: string } }>(
    target,
    `/repos/${target.owner}/${target.repo}/git/ref/heads/${ref}`,
  );
  if (result.ok && result.data.object?.sha) return result.data.object.sha;

  const fallback = await githubJson<{ sha?: string }>(
    target,
    `/repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(target.branch)}?per_page=1`,
  );
  if (fallback.ok && fallback.data.sha) return fallback.data.sha;

  const failed = result.ok ? fallback : result;
  if (!failed.ok) {
    throw formatGithubHttpError('ref', `heads/${target.branch}`, failed.status, failed.text);
  }
  throw new Error(`GitHub ref heads/${target.branch} sans sha`);
}

async function getCommitTreeSha(target: GithubRepoTarget, commitSha: string): Promise<string> {
  const result = await githubJson<{ tree?: { sha?: string } }>(
    target,
    `/repos/${target.owner}/${target.repo}/git/commits/${commitSha}`,
  );
  if (!result.ok) {
    throw formatGithubHttpError('commit', commitSha, result.status, result.text);
  }
  const treeSha = result.data.tree?.sha;
  if (!treeSha) throw new Error(`GitHub commit ${commitSha} sans tree`);
  return treeSha;
}

/** Métadonnées du fichier à un commit précis (immuable — jamais de SHA périmé). */
async function readGithubFileMeta(
  target: GithubRepoTarget,
  repoPath: string,
  ref: string,
): Promise<{ sha: string; inline?: Buffer } | null> {
  const res = await githubRequest(
    target,
    `/repos/${target.owner}/${target.repo}/contents/${encodedRepoPath(repoPath)}?ref=${encodeURIComponent(ref)}`,
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

async function readGithubFileBuffer(
  target: GithubRepoTarget,
  repoPath: string,
  meta: { sha: string; inline?: Buffer },
): Promise<Buffer> {
  return meta.inline ?? readGithubBlob(target, repoPath, meta.sha);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null || typeof a !== 'object') return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Fusion 3-voies : conserve nos changements et ceux arrivés sur GitHub entre-temps. */
function threeWayJsonMerge(base: unknown, local: unknown, remote: unknown): unknown {
  if (jsonEqual(local, remote)) return local;
  if (jsonEqual(local, base)) return remote;
  if (jsonEqual(remote, base)) return local;

  if (isPlainObject(local) && isPlainObject(remote)) {
    const baseObj = isPlainObject(base) ? base : {};
    const keys = new Set([
      ...Object.keys(baseObj),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const inBase = Object.prototype.hasOwnProperty.call(baseObj, key);
      const inLocal = Object.prototype.hasOwnProperty.call(local, key);
      const inRemote = Object.prototype.hasOwnProperty.call(remote, key);
      const baseVal = inBase ? baseObj[key] : undefined;
      const localVal = inLocal ? local[key] : undefined;
      const remoteVal = inRemote ? remote[key] : undefined;

      if (!inLocal && !inRemote) continue;
      if (!inLocal) {
        if (!inBase || !jsonEqual(remoteVal, baseVal)) out[key] = remoteVal;
        continue;
      }
      if (!inRemote) {
        if (!inBase || !jsonEqual(localVal, baseVal)) out[key] = localVal;
        continue;
      }
      out[key] = threeWayJsonMerge(inBase ? baseVal : undefined, localVal, remoteVal);
    }
    return out;
  }

  return local;
}

function mergeJsonBuffers(base: Buffer, local: Buffer, remote: Buffer): Buffer {
  try {
    const merged = threeWayJsonMerge(
      JSON.parse(base.toString('utf8')),
      JSON.parse(local.toString('utf8')),
      JSON.parse(remote.toString('utf8')),
    );
    return Buffer.from(JSON.stringify(merged, null, 2), 'utf8');
  } catch {
    return local;
  }
}

const GITHUB_WRITE_ATTEMPTS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function conflictBackoffMs(attempt: number): number {
  const exp = Math.min(1200, 120 * 2 ** (attempt - 1));
  return exp + Math.floor(Math.random() * 80);
}

function isRetryableWriteStatus(status: number): boolean {
  return status === 409 || status === 422 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Un seul verrou pour toute la branche : chaque fichier est un commit sur `main`. */
let githubBranchLock: Promise<unknown> = Promise.resolve();

function withGithubWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = githubBranchLock.then(fn, fn);
  githubBranchLock = run.catch(() => undefined);
  return run;
}

async function createGithubBlob(target: GithubRepoTarget, buffer: Buffer): Promise<string> {
  const result = await githubJson<{ sha?: string }>(
    target,
    `/repos/${target.owner}/${target.repo}/git/blobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' }),
    },
  );
  if (!result.ok) {
    throw formatGithubHttpError('blob', 'git/blobs', result.status, result.text);
  }
  if (!result.data.sha) throw new Error('GitHub blob sans sha');
  return result.data.sha;
}

async function createGithubTree(
  target: GithubRepoTarget,
  baseTreeSha: string,
  repoPath: string,
  blobSha: string,
): Promise<string> {
  const result = await githubJson<{ sha?: string }>(
    target,
    `/repos/${target.owner}/${target.repo}/git/trees`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{ path: repoPath, mode: '100644', type: 'blob', sha: blobSha }],
      }),
    },
  );
  if (!result.ok) {
    throw formatGithubHttpError('tree', repoPath, result.status, result.text);
  }
  if (!result.data.sha) throw new Error('GitHub tree sans sha');
  return result.data.sha;
}

async function createGithubCommit(
  target: GithubRepoTarget,
  message: string,
  treeSha: string,
  parentSha: string,
): Promise<string> {
  const result = await githubJson<{ sha?: string }>(
    target,
    `/repos/${target.owner}/${target.repo}/git/commits`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
    },
  );
  if (!result.ok) {
    throw formatGithubHttpError('commit', message, result.status, result.text);
  }
  if (!result.data.sha) throw new Error('GitHub commit sans sha');
  return result.data.sha;
}

async function updateGithubBranchRef(
  target: GithubRepoTarget,
  commitSha: string,
): Promise<{ ok: true } | { ok: false; status: number; text: string }> {
  const result = await githubJson<unknown>(
    target,
    `/repos/${target.owner}/${target.repo}/git/refs/heads/${encodedBranchRef(target.branch)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force: false }),
    },
  );
  if (result.ok) return { ok: true };
  return result;
}

/**
 * Écrit via Git Data API (blob → tree → commit → fast-forward de la branche).
 * En cas de conflit : rebase sur HEAD, fusion JSON si le fichier a bougé, puis retry.
 */
async function writeGithubFile(
  target: GithubRepoTarget,
  repoPath: string,
  buffer: Buffer,
  message: string,
  baseBuffer?: Buffer,
): Promise<{ sha: string; buffer: Buffer }> {
  let payload = buffer;
  let mergeBase = baseBuffer;
  const canMergeJson = repoPath.endsWith('.json');
  let lastError = '';

  for (let attempt = 1; attempt <= GITHUB_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const headSha = await getHeadCommitSha(target);
      const [treeSha, remote] = await Promise.all([
        getCommitTreeSha(target, headSha),
        readGithubFileMeta(target, repoPath, headSha),
      ]);

      if (remote?.sha && canMergeJson && mergeBase && remote.sha !== knownRemoteSha.get(repoPath)) {
        const remoteBuf = await readGithubFileBuffer(target, repoPath, remote);
        if (!remoteBuf.equals(payload) && !remoteBuf.equals(mergeBase)) {
          payload = mergeJsonBuffers(mergeBase, payload, remoteBuf);
        }
        mergeBase = remoteBuf;
      }

      const blobSha = await createGithubBlob(target, payload);
      if (remote?.sha === blobSha) {
        return { sha: blobSha, buffer: payload };
      }

      const newTreeSha = await createGithubTree(target, treeSha, repoPath, blobSha);
      const newCommitSha = await createGithubCommit(target, message, newTreeSha, headSha);
      const updated = await updateGithubBranchRef(target, newCommitSha);
      if (updated.ok) return { sha: blobSha, buffer: payload };

      lastError = updated.text;
      if (!isRetryableWriteStatus(updated.status) || attempt === GITHUB_WRITE_ATTEMPTS) {
        throw formatGithubHttpError('écriture', repoPath, updated.status, updated.text);
      }
    } catch (err) {
      if (attempt === GITHUB_WRITE_ATTEMPTS) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      const statusMatch = /\((\d{3})\):/.exec(lastError);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      if (/ 401 | 403 /.test(lastError)) throw err;
      if (status && !isRetryableWriteStatus(status)) throw err;
    }
    await sleep(conflictBackoffMs(attempt));
  }

  throw new Error(
    `GitHub écriture ${repoPath} échouée après ${GITHUB_WRITE_ATTEMPTS} tentatives: ${lastError.slice(0, 180)}`,
  );
}

function rememberLocalFile(repoPath: string, sha: string, buffer: Buffer): void {
  if (!sha) return;
  knownRemoteSha.set(repoPath, sha);
  lastHydratedContent.set(repoPath, buffer);
}

export async function hydrateDurableFile(repoPath: string, localPath: string): Promise<void> {
  if (!isDurableRemoteEnabled()) return;
  const target = resolveGithubTarget();
  if (!target) return;

  try {
    const headSha = await getHeadCommitSha(target);
    const meta = await readGithubFileMeta(target, repoPath, headSha);
    if (!meta) return;
    if (meta.sha && knownRemoteSha.get(repoPath) === meta.sha && fs.existsSync(localPath)) {
      if (!lastHydratedContent.has(repoPath)) {
        lastHydratedContent.set(repoPath, fs.readFileSync(localPath));
      }
      return;
    }
    const buffer = await readGithubFileBuffer(target, repoPath, meta);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    if (meta.sha) rememberLocalFile(repoPath, meta.sha, buffer);
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

  await withGithubWriteLock(async () => {
    const body = await fsPromises.readFile(localPath);
    const label = path.basename(repoPath);
    const written = await writeGithubFile(
      target,
      repoPath,
      body,
      `chore(data): update ${label} from RH app${isVercelRuntime() ? ' (Vercel)' : ''}`,
      lastHydratedContent.get(repoPath) ?? body,
    );
    if (!written.buffer.equals(body)) {
      await fsPromises.writeFile(localPath, written.buffer);
    }
    rememberLocalFile(repoPath, written.sha, written.buffer);
  });
}
