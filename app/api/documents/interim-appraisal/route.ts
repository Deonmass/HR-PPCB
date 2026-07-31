import { NextResponse } from 'next/server';
import { generateInterimAppraisal } from '@/lib/employee-docs.server';
import { getEmployee } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(request: Request) {
  const denied = await checkPermission('documents.appraisal', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as { matricule?: string };
    const matricule = body.matricule?.trim();
    if (!matricule) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }
    const employee = await getEmployee(matricule);
    if (!employee) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
    }

    const doc = await generateInterimAppraisal(employee);

    await auditSimpleAction({
      module: 'documents.appraisal',
      moduleLabel: 'Documents',
      action: 'export',
      summary: `Interim appraisal — ${employee.nom} (${employee.matricule})`,
    });

    return new NextResponse(new Uint8Array(doc.buffer), {
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
