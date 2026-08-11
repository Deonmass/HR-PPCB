import { NextResponse } from 'next/server';
import { generateContratStandard } from '@/lib/contrat-standard-docs.server';
import { emptyContratForm, type ContratStandardFormData } from '@/lib/contrat-standard-types';
import { CLASSIFICATION_RULES, type ContractClassification } from '@/lib/convention-collective-rules';
import { readDependantsData } from '@/lib/dependants-json-store';
import { isChildStatut, isSpouseStatut } from '@/lib/dependants-utils';
import { getEmployee } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function splitPersonName(full: string): { prenom: string; nom: string; postNom: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: '', nom: '', postNom: '' };
  if (parts.length === 1) return { prenom: parts[0], nom: '', postNom: '' };
  if (parts.length === 2) return { prenom: parts[0], nom: parts[1], postNom: '' };
  return {
    prenom: parts[0],
    nom: parts.slice(1, -1).join(' '),
    postNom: parts[parts.length - 1],
  };
}

/** GET — contexte agent + famille pour préremplir le formulaire. */
export async function GET(request: Request) {
  const denied = await checkPermission('documents.contrat-standard', 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const matricule = searchParams.get('matricule')?.trim();
  if (!matricule) {
    return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
  }

  const employee = await getEmployee(matricule);
  if (!employee) {
    return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
  }

  let spouse: ReturnType<typeof splitPersonName> | null = null;
  const children: Array<ReturnType<typeof splitPersonName> & { birthPlaceDate: string }> = [];
  try {
    const data = await readDependantsData();
    const family = data.dependants.filter(
      (d) => String(d.matricule).trim() === matricule && !/employ/i.test(d.statut),
    );
    const spouseRow = family.find((d) => isSpouseStatut(d.statut));
    if (spouseRow) spouse = splitPersonName(spouseRow.nom);
    for (const child of family.filter((d) => isChildStatut(d.statut)).slice(0, 4)) {
      const parts = splitPersonName(child.nom);
      const loc = (child.localisation || '').trim();
      const birth = (child.dateNaissance || '').trim();
      children.push({
        ...parts,
        birthPlaceDate: loc && birth ? `${loc}-${birth}` : birth || loc,
      });
    }
  } catch {
    // Famille optionnelle si le store dépendants est indisponible.
  }

  return NextResponse.json({ employee, spouse, children });
}

function sanitizeForm(raw: unknown): ContratStandardFormData {
  const base = emptyContratForm();
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<ContratStandardFormData>;
  const classification = (['classifie', 'maitrise', 'cadre'].includes(String(body.classification))
    ? body.classification
    : 'maitrise') as ContractClassification;
  const rules = CLASSIFICATION_RULES[classification];
  const dependants = Array.isArray(body.dependants)
    ? body.dependants.slice(0, 4).map((row) => ({
      prenom: String(row?.prenom || '').trim(),
      nom: String(row?.nom || '').trim(),
      postNom: String(row?.postNom || '').trim(),
      birthPlaceDate: String(row?.birthPlaceDate || '').trim(),
    }))
    : base.dependants;
  while (dependants.length < 4) {
    dependants.push({ prenom: '', nom: '', postNom: '', birthPlaceDate: '' });
  }

  return {
    ...base,
    ...body,
    matricule: String(body.matricule || '').trim(),
    employeeName: String(body.employeeName || '').trim(),
    civility: body.civility === 'Madame' ? 'Madame' : 'Monsieur',
    nationality: String(body.nationality || '').trim(),
    birthDate: String(body.birthDate || '').trim(),
    maritalStatus: String(body.maritalStatus || '').trim(),
    address: String(body.address || '').trim(),
    phone: String(body.phone || '').trim(),
    email: String(body.email || '').trim(),
    cnss: String(body.cnss || '').trim(),
    identityNumber: String(body.identityNumber || '').trim(),
    spousePrenom: String(body.spousePrenom || '').trim(),
    spouseNom: String(body.spouseNom || '').trim(),
    spousePostNom: String(body.spousePostNom || '').trim(),
    dependants,
    contractType: body.contractType === 'CDI' ? 'CDI' : 'CDD',
    contractDurationLabel: String(body.contractDurationLabel || base.contractDurationLabel).trim(),
    startDate: String(body.startDate || '').trim(),
    trialMonths: Number(body.trialMonths) > 0 ? Number(body.trialMonths) : rules.trialMonths,
    jobTitle: String(body.jobTitle || '').trim(),
    lineManagerTitle: String(body.lineManagerTitle || '').trim(),
    workLocation: String(body.workLocation || '').trim(),
    classification,
    categoryCode: String(body.categoryCode || '').trim(),
    salaryUsd: Number(body.salaryUsd) || 0,
    exchangeRate: Number(body.exchangeRate) > 0 ? Number(body.exchangeRate) : base.exchangeRate,
    leaveDays: Number(body.leaveDays) > 0 ? Number(body.leaveDays) : rules.annualLeaveDays,
    documentDate: String(body.documentDate || base.documentDate).trim(),
    signerMatricule: String(body.signerMatricule || '').trim(),
    signerName: String(body.signerName || '').trim(),
    signerTitle: String(body.signerTitle || '').trim(),
  };
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.contrat-standard', 'create');
  if (denied) return denied;

  try {
    const body = await request.json();
    const form = sanitizeForm(body);
    if (!form.matricule && !form.employeeName) {
      return NextResponse.json({ error: 'Agent requis' }, { status: 400 });
    }
    if (!form.address.trim()) {
      return NextResponse.json({ error: 'Adresse de l’employé requise (Article 12)' }, { status: 400 });
    }
    if (!form.salaryUsd || form.salaryUsd <= 0) {
      return NextResponse.json({ error: 'Salaire USD requis' }, { status: 400 });
    }
    if (!form.signerName.trim()) {
      return NextResponse.json({ error: 'Signataire RH (employeur) requis' }, { status: 400 });
    }

    const doc = await generateContratStandard(form);
    await auditSimpleAction({
      module: 'documents.contrat-standard',
      moduleLabel: 'Contrat standard',
      action: 'export',
      summary: `Contrat ${form.contractType} — ${form.employeeName || form.matricule}`,
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
