import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  buildTravelFolderName,
  buildTravelSaveDirectoryPath,
  getTravelSaveBaseDirectory,
  resolveTravelSaveDirectoryFromFolderName,
} from '@/lib/travel-paths';

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.historique', action: 'view' },
  ]);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const folderName = searchParams.get('folderName')?.trim();
  const employeeName = searchParams.get('employeeName')?.trim();
  const documentDate = searchParams.get('documentDate')?.trim();

  const basePath = getTravelSaveBaseDirectory();
  let resolvedFolderName = folderName ?? '';

  if (!resolvedFolderName && employeeName) {
    resolvedFolderName = buildTravelFolderName(employeeName, documentDate ?? '');
  }

  const fullPath = resolvedFolderName
    ? resolveTravelSaveDirectoryFromFolderName(resolvedFolderName)
    : employeeName && documentDate
      ? buildTravelSaveDirectoryPath(employeeName, documentDate)
      : basePath;

  return NextResponse.json({
    basePath,
    folderName: resolvedFolderName || null,
    fullPath,
  });
}
