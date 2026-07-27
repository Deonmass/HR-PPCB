import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { getDataBackend, isVercelRuntime } from './runtime-mode';

/** Paths inside the git repository (source of truth for users / permissions). */
export const DURABLE_PARAMS_KEY = 'Excel/Params.xlsx';
export const DURABLE_PERMISSIONS_KEY = 'data/auth/permissions.json';

interface GithubRepoTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

function resolveGithubTarget(): GithubRepoTarget | null {
  // Prefer HR_GITHUB_TOKEN — Vercel/GitHub may interfere with a bare GITHUB_TOKEN name.
  const raw = (
    process.env.HR_GITHUB_TOKEN
    || process.env.GH_TOKEN
    || process.env.GITHUB_PAT
    || process.env.GITHUB_TOKEN
    || ''
  ).trim();
  // Users sometimes paste the value with quotes in Vercel.
  const token = raw.replace(/^['"]+|['"]+$/g, '').trim();
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

  return { owner, repo, branch, token };
}

export function needsDurableRemote(): boolean {
  return getDataBackend() === 'tmp';
}

export function isDurableRemoteEnabled(): boolean {
  return needsDurableRemote() && Boolean(resolveGithubTarget());
}

/**
 * On Vercel the project folder is read-only, so we sync Excel/JSON back into the
 * GitHub repository (same files as in your project directory).
 */
export function assertDurableRemoteConfigured(action = 'sauvegarder'): void {
  if (!needsDurableRemote()) return;
  if (isDurableRemoteEnabled()) return;
  throw new Error(
    `Impossible de ${action} dans Excel/ sur Vercel : token GitHub absent au runtime. `
      + 'Ajoutez HR_GITHUB_TOKEN (Production + Preview), puis Redeploy. '
      + 'Fine-grained token : repository Deonmass/HR-PPCB, Contents = Read and write.',
  );
}

function formatGithubHttpError(action: string, repoPath: string, status: number, body: string): Error {
  if (status === 401) {
    return new Error(
      `GitHub ${action} ${repoPath} : token invalide (401 Bad credentials). `
        + 'Le token est révoqué, mal collé, ou la variable Vercel est obsolète. '
        + 'Créez un nouveau fine-grained token, mettez-le dans HR_GITHUB_TOKEN (sans guillemets), '
        + 'supprimez l’ancienne variable GITHUB_TOKEN si besoin, puis Redeploy.',
    );
  }
  if (status === 403) {
    return new Error(
      `GitHub ${action} ${repoPath} : accès refusé (403). `
        + 'Sur le token fine-grained, activez Contents: Read and write pour Deonmass/HR-PPCB.',
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
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${target.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hr-rh-app',
      ...(init?.headers ?? {}),
    },
  });
}

async function readGithubFile(
  target: GithubRepoTarget,
  repoPath: string,
): Promise<{ buffer: Buffer; sha: string } | null> {
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

  const json = (await res.json()) as { content?: string; encoding?: string; sha?: string; download_url?: string };
  if (json.download_url) {
    const fileRes = await fetch(json.download_url, {
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'hr-rh-app',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw formatGithubHttpError('download', repoPath, fileRes.status, text);
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, sha: json.sha || '' };
  }

  if (!json.content || json.encoding !== 'base64') {
    throw new Error(`Contenu GitHub invalide pour ${repoPath}`);
  }
  return {
    buffer: Buffer.from(json.content.replace(/\n/g, ''), 'base64'),
    sha: json.sha || '',
  };
}

async function writeGithubFile(
  target: GithubRepoTarget,
  repoPath: string,
  buffer: Buffer,
  message: string,
): Promise<void> {
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const existing = await readGithubFile(target, repoPath);

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
    // Concurrent update — retry once with fresh sha.
    const latest = await readGithubFile(target, repoPath);
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
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw formatGithubHttpError('écriture', repoPath, res.status, text);
  }
}

/** Pull Excel/JSON from the GitHub repo into the local working path (Vercel /tmp). */
export async function hydrateDurableFile(repoPath: string, localPath: string): Promise<void> {
  if (!isDurableRemoteEnabled()) return;
  const target = resolveGithubTarget();
  if (!target) return;

  try {
    const remote = await readGithubFile(target, repoPath);
    if (!remote) return;
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, remote.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[durable-fs] hydrate failed', repoPath, message);
  }
}

/**
 * Persist local working copy:
 * - local/dev: already written under Excel/ or data/auth/ (no-op here)
 * - Vercel: commit the file into the GitHub repository path
 */
export async function persistDurableFile(repoPath: string, localPath: string): Promise<void> {
  if (!needsDurableRemote()) {
    // Local mode already saved into the project Excel/data directories.
    return;
  }

  assertDurableRemoteConfigured('persister');
  const target = resolveGithubTarget();
  if (!target) return;

  const body = await fsPromises.readFile(localPath);
  const label = path.basename(repoPath);
  await writeGithubFile(
    target,
    repoPath,
    body,
    `chore(data): update ${label} from RH app${isVercelRuntime() ? ' (Vercel)' : ''}`,
  );
}
