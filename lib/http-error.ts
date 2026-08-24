/** Extract a user-facing message from a failed fetch response (JSON, HTML, or empty). */
export async function readResponseError(
  res: Response,
  fallback = 'Erreur serveur',
): Promise<string> {
  const statusHint =
    res.status === 401
      ? 'Session expirée — reconnectez-vous.'
      : res.status === 403
        ? 'Permission refusée.'
        : res.status === 413
          ? 'Fichier trop volumineux pour le serveur.'
          : res.status === 408 || res.status === 504
            ? 'Délai dépassé côté serveur. Réessayez.'
            : res.status >= 500
              ? `Erreur serveur (HTTP ${res.status}).`
              : '';

  const raw = await res.text().catch(() => '');
  const trimmed = raw.trim();
  if (trimmed) {
    try {
      const json = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
      const msg = [json.error, json.message]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find(Boolean);
      if (msg) return msg;
    } catch {
      const stripped = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
      if (stripped) {
        return statusHint ? `${statusHint} ${stripped}` : `Erreur ${res.status} : ${stripped}`;
      }
    }
  }

  return statusHint || `${fallback} (HTTP ${res.status})`;
}

export function formatFetchFailure(err: unknown, fallback = 'Génération impossible'): string {
  if (err instanceof TypeError) {
    return 'Impossible de joindre le serveur. Vérifiez la connexion, puis réessayez.';
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
