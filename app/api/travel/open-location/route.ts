import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  assertExistingDirectory,
  assertExistingFile,
  isWindows,
  openFileLocation,
  openFolder,
} from '@/lib/windows-shell';
import { auditSimpleAction } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.historique', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const body = (await request.json()) as { filePath?: string; directoryPath?: string };
    const directoryPath = body.directoryPath?.trim();
    const filePath = body.filePath?.trim();

    if (directoryPath) {
      const resolved = await assertExistingDirectory(directoryPath);
      if (!isWindows()) {
        return NextResponse.json({
          opened: false,
          message: 'Ouverture automatique disponible uniquement sous Windows',
          directoryPath: resolved,
        });
      }

      await openFolder(resolved);
      await auditSimpleAction({
        module: 'travel.etablir',
        action: 'other',
        summary: 'Ouverture dossier voyage',
        details: `Dossier ouvert : ${resolved}`,
      });
      return NextResponse.json({ opened: true, directoryPath: resolved });
    }

    if (!filePath) {
      return NextResponse.json({ error: 'Chemin du dossier ou du fichier requis' }, { status: 400 });
    }

    const resolved = await assertExistingFile(filePath);
    if (!isWindows()) {
      return NextResponse.json({
        opened: false,
        message: 'Ouverture automatique disponible uniquement sous Windows',
        filePath: resolved,
      });
    }

    await openFileLocation(resolved);
    await auditSimpleAction({
      module: 'travel.historique',
      action: 'other',
      summary: 'Ouverture emplacement fichier voyage',
      details: `Emplacement ouvert : ${resolved}`,
    });
    return NextResponse.json({ opened: true, filePath: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Impossible d\'ouvrir l\'emplacement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
