'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadAfterChunkError } from '@/lib/chunk-error';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      reloadAfterChunkError();
    }
  }, [error]);

  return (
    <div className="page-error">
      <div className="panel panel-padded">
        <h2>Une erreur est survenue</h2>
        <p className="text-muted">
          {isChunkLoadError(error)
            ? 'Rechargement de la page en cours…'
            : error.message || 'Erreur inattendue'}
        </p>
        {!isChunkLoadError(error) && (
          <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
