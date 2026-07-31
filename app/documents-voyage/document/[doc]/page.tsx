import { notFound } from 'next/navigation';
import { isSingleTravelDocId } from '@/lib/travel-single-doc';
import TravelSingleDocClient from './TravelSingleDocClient';

interface Props {
  params: Promise<{ doc: string }>;
}

export default async function TravelSingleDocPage({ params }: Props) {
  const { doc } = await params;
  if (!isSingleTravelDocId(doc)) notFound();
  return <TravelSingleDocClient doc={doc} />;
}
