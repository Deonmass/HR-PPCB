import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { getCashRequest } from '@/lib/cash-request-store';
import { checkAnyPermission } from '@/lib/require-permission';
import type { TravelFileType } from '@/lib/travel-types';

type Params = { params: Promise<{ id: string }> };

function resolveDownloadFile(
  record: NonNullable<Awaited<ReturnType<typeof getCashRequest>>>,
  fileType: TravelFileType | null,
) {
  if (record.files?.length) {
    if (fileType) {
      return record.files.find((file) => file.type === fileType);
    }
    return record.files.find((file) => file.type === 'cash-request') ?? record.files[0];
  }
  if (!fileType || fileType === 'cash-request') {
    return record.filePath
      ? { type: 'cash-request' as const, fileName: record.fileName, filePath: record.filePath }
      : undefined;
  }
  return undefined;
}

function travelFileContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export async function GET(request: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.historique', action: 'export' },
    { menuId: 'travel.etablir', action: 'export' },
    { menuId: 'travel.etablir', action: 'create' },
    { menuId: 'travel.etablir', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const record = await getCashRequest(id);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }

    const fileType = new URL(request.url).searchParams.get('type') as TravelFileType | null;
    const file = resolveDownloadFile(record, fileType);
    if (!file?.filePath) {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
    }

    const buffer = await fs.readFile(file.filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': travelFileContentType(file.fileName),
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
