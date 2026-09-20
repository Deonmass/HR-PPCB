'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RedirectToClassification() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('q');
    const target = q
      ? `/employes/classification?q=${encodeURIComponent(q)}`
      : '/employes/classification';
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="mvt-page">
      <p className="empty-state">Redirection vers la classification des postes…</p>
    </div>
  );
}

/** Ancien menu Postes → classification des postes (source unique des intitulés). */
export default function PostesRedirectPage() {
  return (
    <Suspense fallback={<div className="mvt-page"><p className="empty-state">Redirection…</p></div>}>
      <RedirectToClassification />
    </Suspense>
  );
}
