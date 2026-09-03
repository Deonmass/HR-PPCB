import { NextResponse } from 'next/server';
import {
  generateMouvementTravailleur,
  isDmtMotifId,
  mergeGeneratedPdfs,
  resolveDeclarationFamily,
  suggestDmtMotif,
  type DmtMotifId,
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

function familyOf(dependants: Dependant[], matricule: string, nom: string) {
  return resolveDeclarationFamily(dependants, { matricule, nom });
}

function parseMotif(value: unknown): DmtMotifId | undefined {
  return typeof value === 'string' && isDmtMotifId(value) ? value : undefined;
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
  const denied = await checkPermission('documents.mouvement-travailleur', 'view');
  if (denied) return denied;

  const matricule = new URL(request.url).searchParams.get('matricule')?.trim();
  if (!matricule) {
    return NextResponse.json({ error: 'Matricule requis' }, { status: 400 });
  }
  const employee = await getEmployee(matricule);
  if (!employee) {
    return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
  }
  const dependants = await loadDependants();
  return NextResponse.json({
    employee,
    family: familyOf(dependants, employee.matricule, employee.nom),
    motif: suggestDmtMotif(employee),
  });
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.mouvement-travailleur', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      matricule?: string;
      motif?: string;
      salary?: string;
      documentDate?: string;
      lieu?: string;
      matricules?: string[];
      items?: Array<{
        matricule?: string;
        motif?: string;
        salary?: string;
        documentDate?: string;
        lieu?: string;
      }>;
    };

    const items: Array<{
      matricule: string;
      motif?: DmtMotifId;
      salary: string;
      documentDate: string;
      lieu: string;
    }> = [];
    const seen = new Set<string>();
    const sharedDate = typeof body.documentDate === 'string' ? body.documentDate.trim() : '';
    const sharedSalary = typeof body.salary === 'string' ? body.salary.trim() : '';
    const sharedLieu = typeof body.lieu === 'string' ? body.lieu.trim() : '';
    const pushItem = (
      matricule: string,
      motif?: DmtMotifId,
      salary = '',
      documentDate = '',
      lieu = '',
    ) => {
      if (!matricule || seen.has(matricule)) return;
      seen.add(matricule);
      items.push({
        matricule,
        motif,
        salary: salary || sharedSalary,
        documentDate: documentDate || sharedDate,
        lieu: lieu || sharedLieu,
      });
    };

    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        pushItem(
          String(item.matricule || '').trim(),
          parseMotif(item.motif),
          typeof item.salary === 'string' ? item.salary.trim() : '',
          typeof item.documentDate === 'string' ? item.documentDate.trim() : '',
          typeof item.lieu === 'string' ? item.lieu.trim() : '',
        );
      }
    }
    for (const matricule of uniqueMatricules([
      ...(Array.isArray(body.matricules) ? body.matricules : []),
      body.matricule,
    ])) {
      pushItem(matricule, parseMotif(body.motif));
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

    const motifByMatricule = new Map(items.map((item) => [item.matricule, item]));
    const dependants = await loadDependants();
    const files = [];
    for (const employee of found) {
      const item = motifByMatricule.get(employee.matricule);
      files.push(
        await generateMouvementTravailleur(
          employee,
          familyOf(dependants, employee.matricule, employee.nom),
          {
            motif: item?.motif,
            salary: item?.salary,
            documentDate: item?.documentDate,
            lieu: item?.lieu,
          },
        ),
      );
    }

    await auditSimpleAction({
      module: 'documents.mouvement-travailleur',
      moduleLabel: 'Documents',
      action: 'export',
      summary: found.length === 1
        ? `Déclaration de mouvement de travailleur — ${found[0].nom} (${found[0].matricule})`
        : `Déclaration de mouvement de travailleur — ${found.length} agents`,
    });

    const merged = await mergeGeneratedPdfs(
      files,
      'DECLARATION DE MOUVEMENT DE TRAVAILLEUR.pdf',
    );
    return pdfResponse(merged.fileName, merged.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
