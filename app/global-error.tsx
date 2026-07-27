'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadAfterChunkError } from '@/lib/chunk-error';

export default function GlobalError({
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
    <html lang="fr">
      <body style={{ margin: 0, background: '#0a0a0f', color: '#e8e8ed', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ padding: '2rem' }}>
          <h2>Une erreur est survenue</h2>
          <p style={{ color: '#9ca3af' }}>
            {isChunkLoadError(error)
              ? 'Rechargement de la page en cours…'
              : error.message || 'Erreur inattendue'}
          </p>
          {!isChunkLoadError(error) && (
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: '#e30613',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
