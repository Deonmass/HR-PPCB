'use client';

import { useParams } from 'next/navigation';
import PolicyDocumentPage from '@/components/politique/PolicyDocumentPage';

export default function PolitiqueDocSlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug || '');
  return <PolicyDocumentPage slug={slug} />;
}
