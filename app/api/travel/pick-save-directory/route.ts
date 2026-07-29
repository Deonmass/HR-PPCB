import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/require-permission';
import { pickWindowsFolder } from '@/lib/windows-folder-picker';
import { isWindows } from '@/lib/windows-shell';
import { auditSimpleAction } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkPermission('travel.etablir', 'view');
  if (denied) return denied;
  try {
    if (!isWindows()) {
      return NextResponse.json(
        { error: 'Sélecteur de dossier natif disponible uniquement sous Windows' },
        { status: 501 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { initialPath?: string };
    const selected = await pickWindowsFolder(body.initialPath);

    if (!selected) {
      return new NextResponse(null, { status: 204 });
    }

    await auditSimpleAction({
      module: 'travel.etablir',
      action: 'other',
      summary: 'Sélection dossier de sauvegarde voyage',
      details: `Dossier choisi : ${selected}`,
    });

    return NextResponse.json({ path: selected });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Impossible d\'ouvrir le sélecteur de dossier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
