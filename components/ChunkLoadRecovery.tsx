'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadAfterChunkError, clearChunkReloadState } from '@/lib/chunk-error';

export default function ChunkLoadRecovery() {
  useEffect(() => {
    clearChunkReloadState();
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!isChunkLoadError(event.error ?? event.message)) return;
      event.preventDefault();
      reloadAfterChunkError();
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) return;
      event.preventDefault();
      reloadAfterChunkError();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
