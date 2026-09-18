/** Messages d’erreur compréhensibles pour l’utilisateur (évite le jargon technique). */

const FALLBACK = 'Une erreur est survenue. Réessayez.';

function statusFallback(status: number, context?: string): string {
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous.';
  if (status === 403) return 'Vous n’avez pas la permission pour cette action.';
  if (status === 404) return context || 'Élément introuvable.';
  if (status === 408 || status === 504) {
    return 'Le serveur met trop de temps à répondre. Réessayez.';
  }
  if (status >= 500) {
    return context
      ? `${context} (erreur serveur). Réessayez dans un moment.`
      : 'Erreur serveur. Réessayez dans un moment.';
  }
  return context || FALLBACK;
}

/**
 * Transforme une erreur technique (JSON parse, network, Abort…) en message FR clair.
 */
export function humanizeErrorMessage(
  raw: unknown,
  fallback: string = FALLBACK,
): string {
  if (raw == null) return fallback;

  if (typeof raw === 'string') {
    return humanizeErrorMessage(new Error(raw), fallback);
  }

  const err = raw instanceof Error ? raw : new Error(String(raw));
  const msg = (err.message || '').trim();
  const name = err.name || '';

  if (name === 'AbortError' || /aborted|AbortError/i.test(msg)) {
    return 'L’opération a été interrompue (délai dépassé). Réessayez.';
  }

  if (
    /Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ENOTFOUND|network/i.test(
      msg,
    )
  ) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.';
  }

  if (/Internal Server Error|Unexpected token ['"]?I['"]?.*Internal/i.test(msg)) {
    return 'Erreur interne du serveur. Réessayez dans un moment.';
  }

  if (
    /Unexpected token|is not valid JSON|JSON\.parse|Unexpected end of JSON/i.test(
      msg,
    )
  ) {
    return 'Le serveur a renvoyé une réponse invalide. Réessayez ou contactez l’administrateur.';
  }

  if (/<!DOCTYPE|<html[\s>]|SyntaxError:/i.test(msg)) {
    return fallback;
  }

  // Stack / chemins de fichiers
  if (/\n\s*at\s+\S+/.test(msg) || /[A-Za-z]:\\Users\\|\/node_modules\//.test(msg)) {
    return fallback;
  }

  if (!msg) return fallback;
  return msg;
}

/**
 * Lit le corps d’une Response API en JSON, avec message clair si HTML / texte d’erreur.
 */
export async function readApiJson<T>(
  response: Response,
  contextFallback: string,
): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text.trim()) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        response.ok
          ? 'Réponse du serveur illisible. Réessayez.'
          : statusFallback(response.status, contextFallback),
      );
    }
  }

  if (!response.ok) {
    const fromBody =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
        ? String((data as { error: string }).error).trim()
        : '';
    throw new Error(
      humanizeErrorMessage(
        fromBody || statusFallback(response.status, contextFallback),
        contextFallback,
      ),
    );
  }

  return data as T;
}
