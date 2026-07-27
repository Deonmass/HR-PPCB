import { NextResponse } from 'next/server';
import { probeDurableGithub } from '@/lib/durable-fs';
import { checkAnyPermission } from '@/lib/require-permission';

/** Diagnostic (admin) : vérifie HR_GITHUB_TOKEN sans exposer le secret. */
export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'settings.utilisateurs', action: 'view' },
    { menuId: 'settings.permissions', action: 'view' },
  ]);
  if (denied) return denied;

  const status = await probeDurableGithub();
  return NextResponse.json(status);
}
