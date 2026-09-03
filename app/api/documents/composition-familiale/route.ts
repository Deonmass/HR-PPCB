import { NextResponse } from 'next/server';
import {
  generateCompositionFamiliale,
  mergeGeneratedPdfs,
  resolveDeclarationFamily,
} from '@/lib/declaration-official-docs.server';
import { DECLARATION_BATCH_LIMIT, uniqueMatricules } from '@/lib/declaration-dmt-motif';
import { readDependantsData } from '@/lib/dependants-json-store';
import { getEmployee, getEmployeesByMatricules } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';
import type { Dependant } from '@/lib/dependants-types';

const PDF_MIME = 'application/pdf';

async function loadDependants(): Promise<Dependant[]> {
  try {
    const data = await readDependantsData();
    return [...data.dependants, ...data.exitedDependants];
  } catch {
    return [];
  }
}

function familyOf(
  dependants: Dependant[],
  matricule: string,
  nom: string,
  memberIds?: number[],
) {
  return resolveDeclarationFamily(dependants, { matricule, nom }, memberIds);
}

function pdfResponse(fileName: string, buffer: Buffer) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': PDF_MIME,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'X-File-Name': encodeURIComponent(fileName),
    },
  });
}

export async function GET(request: Request) {
  const denied = await checkPermission('documents.composition-familiale', 'view');
  if (denied) return denied;

  const dependants = await loadDependants();
  const matricule = new URL(request.url).searchParams.get('matricule')?.trim();
  if (!matricule) {
    return NextResponse.json({ dependants });
  }
  const employee = await getEmployee(matricule);
  if (!employee) {
    return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
  }
  return NextResponse.json({
    employee,
    family: familyOf(dependants, employee.matricule, employee.nom),
    dependants,
  });
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.composition-familiale', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      matricule?: string;
      matricules?: string[];
      items?: Array<{ matricule?: string; memberIds?: number[] }>;
    };

    const items: Array<{ matricule: string; memberIds?: number[] }> = [];
    const seen = new Set<string>();
    const pushItem = (matricule: string, memberIds?: number[]) => {
      if (!matricule || seen.has(matricule)) return;
      seen.add(matricule);
      items.push({ matricule, memberIds });
    };
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        const ids = Array.isArray(item.memberIds)
          ? item.memberIds.filter((id) => Number.isFinite(id))
          : undefined;
        pushItem(String(item.matricule || '').trim(), ids);
      }
    }
    for (const matricule of uniqueMatricules([
      ...(Array.isArray(body.matricules) ? body.matricules : []),
      body.matricule,
    ])) {
      pushItem(matricule);
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
    }
    if (items.length > DECLARATION_BATCH_LIMIT) {
      return NextResponse.json(
        { error: `Maximum ${DECLARATION_BATCH_LIMIT} agents par téléchargement` },
        { status: 400 },
      );
    }

    const { found, missing } = await getEmployeesByMatricules(items.map((item) => item.matricule));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Employé introuvable : ${missing.join(', ')}` },
        { status: 404 },
      );
    }

    const memberIdsByMatricule = new Map(items.map((item) => [item.matricule, item.memberIds]));
    const dependants = await loadDependants();
    const files = [];
    for (const employee of found) {
      files.push(
        await generateCompositionFamiliale(
          employee,
          familyOf(
            dependants,
            employee.matricule,
            employee.nom,
            memberIdsByMatricule.get(employee.matricule),
          ),
        ),
      );
    }

    await auditSimpleAction({
      module: 'documents.composition-familiale',
      moduleLabel: 'Documents',
      action: 'export',
      summary: found.length === 1
        ? `Déclaration de composition familiale — ${found[0].nom} (${found[0].matricule})`
        : `Déclaration de composition familiale — ${found.length} agents`,
    });

    const merged = await mergeGeneratedPdfs(
      files,
      'DECLARATION-DE-COMPOSITION-FAMILIALE-DU-TRAVAILLEUR.pdf',
    );
    return pdfResponse(merged.fileName, merged.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
