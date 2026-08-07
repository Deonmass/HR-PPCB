'use client';

import { Suspense } from 'react';
import TopProgressBar from '@/components/TopProgressBar';

/** Suspense wrapper — useSearchParams dans TopProgressBar. */
export default function TopProgressBarHost() {
  return (
    <Suspense fallback={null}>
      <TopProgressBar />
    </Suspense>
  );
}
