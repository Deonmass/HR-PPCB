import { NextResponse } from 'next/server';
import {
  createAirtimeLine,
  deleteAirtimeLine,
  getAirtimeBundle,
  updateAirtimeLine,
} from '@/lib/airtime-store';
import type { AirtimeLineInput } from '@/lib/airtime-types';
import { checkPermission } from '@/lib/require-permission';

const MENU = 'employes.airtime';

function readLine(body: { line?: Partial<AirtimeLineInput> }): AirtimeLineInput {
  const line = body.line || {};
  return {
    matricule: String(line.matricule || ''),
    nom: String(line.nom || ''),
    grade: String(line.grade || ''),
    centreCout: String(line.centreCout || ''),
    title: String(line.title || ''),
    societe: String(line.societe || ''),
    department: String(line.department || ''),
    place: String(line.place || ''),
    msisdn: String(line.msisdn || ''),
    actualAirtime: line.actualAirtime == null || Number.isNaN(Number(line.actualAirtime))
      ? null
      : Number(line.actualAirtime),
  };
}

export async function GET() {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  try {
    const bundle = await getAirtimeBundle();
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement Airtime';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  try {
    const body = await request.json() as { line?: Partial<AirtimeLineInput> };
    const bundle = await createAirtimeLine(readLine(body));
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Création impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const body = await request.json() as { lineIndex?: number; line?: Partial<AirtimeLineInput> };
    const lineIndex = Number(body.lineIndex);
    if (!Number.isInteger(lineIndex) || lineIndex < 0) {
      return NextResponse.json({ error: 'Ligne introuvable.' }, { status: 400 });
    }
    const bundle = await updateAirtimeLine(lineIndex, readLine(body));
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Modification impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  try {
    const body = await request.json() as { lineIndex?: number };
    const lineIndex = Number(body.lineIndex);
    if (!Number.isInteger(lineIndex) || lineIndex < 0) {
      return NextResponse.json({ error: 'Ligne introuvable.' }, { status: 400 });
    }
    const bundle = await deleteAirtimeLine(lineIndex);
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suppression impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
