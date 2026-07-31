import { NextResponse } from 'next/server';
import {
  EXIT_DOC_LABELS,
  EXIT_DOC_TYPES,
  generateExitDocument,
  type ExitDocType,
} from '@/lib/employee-docs.server';
import { getEmployee } from '@/lib/employees-json-store';
import { appendExitIssued, listExitIssued } from '@/lib/exit-docs-log';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function GET() {
  const denied = await checkPermission('documents.exit', 'view');
  if (denied) return denied;
  const items = await listExitIssued();
  return NextResponse.json(
    [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.exit', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      matricule?: string;
      doc?: string;
      exitDate?: string;
      documentDate?: string;
    };
    const matricule = body.matricule?.trim();
    if (!matricule) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }
    const docType = body.doc as ExitDocType;
    if (!EXIT_DOC_TYPES.includes(docType)) {
      return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 });
    }
    const employee = await getEmployee(matricule);
    if (!employee) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
    }

    const doc = await generateExitDocument(docType, employee, {
      exitDate: body.exitDate,
      documentDate: body.documentDate,
    });

    const actor = await getAuditActor();
    await appendExitIssued({
      matricule: employee.matricule,
      employeeName: employee.nom,
      doc: docType,
      docLabel: EXIT_DOC_LABELS[docType],
      fileName: doc.fileName,
      issuedBy: actor?.userName,
    });

    await auditSimpleAction({
      module: 'documents.exit',
      moduleLabel: 'Documents',
      action: 'export',
      summary: `Document exit « ${EXIT_DOC_LABELS[docType]} » — ${employee.nom} (${employee.matricule})`,
    });

    return new NextResponse(new Uint8Array(doc.buffer), {
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
        'X-File-Name': encodeURIComponent(doc.fileName),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
