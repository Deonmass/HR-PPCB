import { NextResponse } from 'next/server';
import {
  listAdminJsonFiles,
  readAdminJsonFile,
  writeAdminJsonFile,
} from '@/lib/admin-json-store';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await checkPermission('settings.permissions', 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  try {
    if (!filePath) {
      const files = await listAdminJsonFiles();
      return NextResponse.json({ files });
    }
    const file = await readAdminJsonFile(filePath);
    return NextResponse.json(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lecture impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission('settings.permissions', 'edit');
  if (denied) return denied;

  let body: { path?: string; text?: string };
  try {
    body = (await request.json()) as { path?: string; text?: string };
  } catch {
    return NextResponse.json({ error: 'Corps JSON attendu' }, { status: 400 });
  }

  const filePath = String(body.path || '').trim();
  const text = typeof body.text === 'string' ? body.text : '';
  if (!filePath) {
    return NextResponse.json({ error: 'Chemin manquant' }, { status: 400 });
  }

  try {
    const saved = await withAudit(
      {
        module: 'settings.permissions',
        action: 'update',
        entityType: 'json',
        entityId: filePath,
        summary: `JSON modifié — ${filePath}`,
        getBefore: async () => {
          try {
            const current = await readAdminJsonFile(filePath);
            return { path: filePath, preview: current.text.slice(0, 4000) };
          } catch {
            return { path: filePath };
          }
        },
        getAfter: () => ({ path: filePath }),
      },
      () => writeAdminJsonFile(filePath, text),
    );
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enregistrement impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
