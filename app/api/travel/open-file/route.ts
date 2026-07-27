import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/require-permission';
import { assertExistingFile, isWindows, openExcelFile } from '@/lib/windows-shell';

export async function POST(request: Request) {
  const denied = await checkPermission('travel.historique', 'view');
  if (denied) return denied;
  try {    const body = (await request.json()) as { filePath?: string };
    if (!body.filePath?.trim()) {
      return NextResponse.json({ error: 'Chemin du fichier requis' }, { status: 400 });
    }

    const resolved = await assertExistingFile(body.filePath.trim());
    if (!isWindows()) {
      return NextResponse.json({
        opened: false,
        message: 'Ouverture Excel disponible uniquement sous Windows',
        filePath: resolved,
      });
    }

    await openExcelFile(resolved);
    return NextResponse.json({ opened: true, filePath: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Impossible d\'ouvrir le fichier Excel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
