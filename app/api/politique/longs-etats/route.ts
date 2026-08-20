import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import { computeSeniority } from '@/lib/employee-columns';
import { readEmployees } from '@/lib/employees-json-store';
import {
  highestLongServicePalier,
  LONG_SERVICE_POLICY,
  type LongServiceBeneficiary,
} from '@/lib/politique-longs-etats';
import { resolveLongServicePdfPath } from '@/lib/politique-pdf';
import { checkPermission } from '@/lib/require-permission';

export async function GET(request: Request) {
  const denied = await checkPermission('politique.longs-etats', 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'beneficiaires';
  const download = searchParams.get('download') === '1';

  if (mode === 'pdf') {
    try {
      const buffer = await fs.readFile(resolveLongServicePdfPath());
      const disposition = download
        ? `attachment; filename="${LONG_SERVICE_POLICY.filename}"`
        : `inline; filename="${LONG_SERVICE_POLICY.filename}"`;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch {
      return NextResponse.json({ error: 'PDF introuvable' }, { status: 404 });
    }
  }

  try {
    const employees = await readEmployees();
    const asOf = new Date();
    const beneficiaires: LongServiceBeneficiary[] = [];

    for (const employee of employees) {
      if (/^inact/i.test(employee.statut || '')) continue;
      const seniority = computeSeniority(employee.appointmentDate || '', asOf);
      if (!seniority) continue;
      const palier = highestLongServicePalier(seniority.years);
      if (!palier) continue;
      beneficiaires.push({
        matricule: employee.matricule,
        nom: employee.nom,
        departement: employee.departement,
        localisation: employee.localisation,
        appointmentDate: employee.appointmentDate,
        years: seniority.years,
        months: seniority.months,
        palier,
      });
    }

    beneficiaires.sort((a, b) => {
      if (b.palier.years !== a.palier.years) return b.palier.years - a.palier.years;
      if (b.years !== a.years) return b.years - a.years;
      return a.nom.localeCompare(b.nom, 'fr');
    });

    return NextResponse.json({
      title: LONG_SERVICE_POLICY.title,
      total: beneficiaires.length,
      beneficiaires,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
