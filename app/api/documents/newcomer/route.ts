import { NextResponse } from 'next/server';
import {
  generateNewcomerDocument,
  NEWCOMER_DOC_LABELS,
  NEWCOMER_DOC_TYPES,
  type NewcomerDocPayload,
  type NewcomerDocType,
} from '@/lib/newcomer-docs.server';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkPermission('documents.newcomer', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<NewcomerDocPayload> & {
      doc?: string;
    };
    const docType = body.doc as NewcomerDocType;
    if (!NEWCOMER_DOC_TYPES.includes(docType)) {
      return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 });
    }

    const payload: NewcomerDocPayload = {
      jobTitle: String(body.jobTitle || '').trim(),
      managerName: String(body.managerName || '').trim(),
      startDate: String(body.startDate || '').trim(),
      siteLocation: String(body.siteLocation || '').trim(),
      department: String(body.department || '').trim(),
      costCentre: String(body.costCentre || '').trim(),
      managerFullNames: String(body.managerFullNames || body.managerName || '').trim(),
      hrFullNames: String(body.hrFullNames || '').trim(),
      grade: String(body.grade || '').trim(),
    };

    if (docType !== 'declaration' && !payload.jobTitle) {
      return NextResponse.json({ error: 'Poste (Job Title) requis' }, { status: 400 });
    }

    const doc = await generateNewcomerDocument(docType, payload);

    await auditSimpleAction({
      module: 'documents.newcomer',
      moduleLabel: 'Documents',
      action: 'export',
      summary: `Newcomer « ${NEWCOMER_DOC_LABELS[docType]} » — ${payload.jobTitle || 'pack'}`,
    });

    return new NextResponse(new Uint8Array(doc.buffer), {
      headers: {
        'Content-Type': doc.contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
        'X-File-Name': encodeURIComponent(doc.fileName),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
