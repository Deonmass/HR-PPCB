import { NextResponse } from 'next/server';
import { generateConfirmationLetter } from '@/lib/confirmation-letter-docs.server';
import {
  CONFIRMATION_SIGNATORY_NAME,
  CONFIRMATION_SIGNATORY_TITLE,
  confirmationCityFromLocalisation,
  confirmationCompanyNames,
  todayIsoDate,
  type ConfirmationLetterInput,
} from '@/lib/confirmation-letter';
import { civilityFromGender, formatLetterName } from '@/lib/reponse-demission';
import { getEmployee } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function familyNameFromFull(fullName: string): string {
  const formatted = formatLetterName(fullName);
  const parts = formatted.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return formatted;
  return parts.slice(0, -1).join(' ');
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.confirmation-letter', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<ConfirmationLetterInput> & { matricule?: string };
    const matricule = body.matricule?.trim();
    if (!matricule) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }
    const employee = await getEmployee(matricule);
    if (!employee) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
    }

    const companies = confirmationCompanyNames(employee.company || '');
    const displayName = formatLetterName(employee.nom) || employee.nom;
    const input: ConfirmationLetterInput = {
      matricule: employee.matricule,
      employeeName: body.employeeName?.trim() || displayName,
      familyName: body.familyName?.trim() || familyNameFromFull(employee.nom),
      civility: body.civility === 'Madame' ? 'Madame' : civilityFromGender(employee.gender || ''),
      jobTitle: body.jobTitle?.trim() || employee.jobTitle || employee.position || '',
      companyShort: body.companyShort?.trim() || companies.short,
      companyLegal: body.companyLegal?.trim() || companies.legal,
      city: body.city?.trim() || confirmationCityFromLocalisation(employee.localisation || ''),
      letterDate: body.letterDate?.trim() || todayIsoDate(),
      confirmationDate: body.confirmationDate?.trim() || employee.dateFinPeriodeEssai || todayIsoDate(),
      signatoryName: body.signatoryName?.trim() || CONFIRMATION_SIGNATORY_NAME,
      signatoryTitle: body.signatoryTitle?.trim() || CONFIRMATION_SIGNATORY_TITLE,
    };

    const doc = await generateConfirmationLetter(input);

    await auditSimpleAction({
      module: 'documents.confirmation-letter',
      moduleLabel: 'Documents',
      action: 'export',
      summary: `Lettre de confirmation — ${employee.nom} (${employee.matricule})`,
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
