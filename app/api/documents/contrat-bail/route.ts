import { NextResponse } from 'next/server';
import { generateContratBail } from '@/lib/contrat-bail-docs.server';
import {
  buildBailPropertyAddress,
  emptyContratBailForm,
  type ContratBailFormData,
} from '@/lib/contrat-bail-types';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function sanitizeForm(raw: unknown): ContratBailFormData {
  const base = emptyContratBailForm();
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<ContratBailFormData>;
  const maisonNumero = String(body.maisonNumero || '').trim();
  const propertyAddress = String(body.propertyAddress || '').trim()
    || buildBailPropertyAddress(maisonNumero);
  return {
    ...base,
    documentDate: String(body.documentDate || base.documentDate).trim(),
    occupationStartDate: String(body.occupationStartDate || base.occupationStartDate).trim(),
    propertyAddress,
    maisonNumero,
    occupantName: String(body.occupantName || '').trim(),
    occupantMatricule: String(body.occupantMatricule || '').trim(),
    occupantIdentityNumber: String(
      body.occupantIdentityNumber || body.occupantMatricule || '',
    ).trim(),
    signerName: String(body.signerName || base.signerName).trim(),
    signerTitle: String(body.signerTitle || base.signerTitle).trim(),
  };
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.contrat-bail', 'create');
  if (denied) return denied;

  try {
    const body = await request.json();
    const form = sanitizeForm(body);
    if (!form.occupantName.trim()) {
      return NextResponse.json({ error: 'Nom de l’occupant requis' }, { status: 400 });
    }
    if (!form.occupantIdentityNumber.trim() && !form.occupantMatricule.trim()) {
      return NextResponse.json({ error: 'Matricule / n° d’identité requis' }, { status: 400 });
    }
    if (!form.propertyAddress.trim()) {
      return NextResponse.json({ error: 'Adresse des locaux requise' }, { status: 400 });
    }
    if (!form.occupationStartDate.trim()) {
      return NextResponse.json({ error: 'Date de début d’occupation requise' }, { status: 400 });
    }
    if (!form.signerName.trim()) {
      return NextResponse.json({ error: 'Signataire société (RH) requis' }, { status: 400 });
    }

    const doc = await generateContratBail(form);
    await auditSimpleAction({
      module: 'documents.contrat-bail',
      moduleLabel: 'Contrat de bail',
      action: 'export',
      summary: `Contrat de bail — ${form.occupantName || form.occupantMatricule}`,
    });

    return new NextResponse(new Uint8Array(doc.buffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Génération impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
