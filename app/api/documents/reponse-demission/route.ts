import { NextResponse } from 'next/server';
import { getEmployee } from '@/lib/employees-json-store';
import { generateReponseDemission } from '@/lib/reponse-demission-docs.server';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(request: Request) {
  const denied = await checkPermission('documents.reponse-demission', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      matricule?: string;
      documentDate?: string;
      resignationDate?: string;
      desiredEndDate?: string;
      band?: string;
      unionDelegate?: boolean;
    };
    const matricule = body.matricule?.trim();
    if (!matricule) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }
    const employee = await getEmployee(matricule);
    if (!employee) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
    }

    const doc = await generateReponseDemission(employee, {
      documentDate: body.documentDate,
      resignationDate: body.resignationDate,
      desiredEndDate: body.desiredEndDate,
      band: body.band,
      unionDelegate: body.unionDelegate === true,
    });

    await auditSimpleAction({
      module: 'documents.reponse-demission',
      moduleLabel: 'Documents',
      action: 'export',
      summary: `Réponse démission — ${employee.nom} (${employee.matricule})`,
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
    const status = /introuvable/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
