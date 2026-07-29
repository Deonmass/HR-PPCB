import { NextResponse } from 'next/server';
import { getWorkVisaDossier, renewWorkVisaDocument } from '@/lib/work-visa-store';
import type { WorkVisaDocKind, WorkVisaDocumentInput } from '@/lib/work-visa-types';
import { WORK_VISA_DOC_LABELS } from '@/lib/work-visa-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.visa-travail';
const KINDS: WorkVisaDocKind[] = ['passport', 'workVisa', 'workCard', 'vsr'];

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as {
      kind?: WorkVisaDocKind;
      document?: WorkVisaDocumentInput;
    } & WorkVisaDocumentInput;

    const kind = body.kind;
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 });
    }

    const document: WorkVisaDocumentInput = body.document ?? {
      number: body.number,
      type: body.type,
      issueDate: body.issueDate,
      startDate: body.startDate,
      expiryDate: body.expiryDate,
    };

    const dossier = await withAudit(
      {
        module: 'protocol.visa-travail',
        action: 'update',
        entityType: 'work-visa.dossier',
        entityId: id,
        summary: `Renouvellement ${WORK_VISA_DOC_LABELS[kind]}`,
        getBefore: () => getWorkVisaDossier(id),
        path: `/api/protocol/work-visas/${id}/renew`,
        method: 'POST',
      },
      () => renewWorkVisaDocument(id, kind, document),
    );
    return NextResponse.json(dossier);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de renouvellement';
    const status = message.includes('introuvable') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
