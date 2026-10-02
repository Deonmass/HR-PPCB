import 'server-only';

import ExcelJS from 'exceljs';
import type { DepartmentSetting, ServiceSetting } from './auth-types';
import { compareExcoDepartments } from './exco-department-map';
import { buildExportDateStamp } from './employee-filters';

/**
 * Excel : une colonne par département, services listés en dessous (ligne 2+).
 */
export async function buildDepartmentsServicesExcelBuffer(
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): Promise<{ buffer: Buffer; filename: string }> {
  const activeDepts = departments
    .filter((item) => item.active)
    .sort((a, b) => compareExcoDepartments(a.name, b.name));

  const servicesByDept = new Map<string, ServiceSetting[]>();
  for (const dept of activeDepts) {
    const list = services
      .filter((svc) => svc.active && svc.departmentId === dept.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    servicesByDept.set(dept.id, list);
  }

  const maxServices = Math.max(0, ...[...servicesByDept.values()].map((list) => list.length));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();

  const ws = wb.addWorksheet('Départements & services', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerRow = ws.addRow(activeDepts.map((dept) => dept.name));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE30613' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 28;

  for (let i = 0; i < maxServices; i += 1) {
    const rowValues = activeDepts.map((dept) => {
      const list = servicesByDept.get(dept.id) ?? [];
      return list[i]?.name ?? '';
    });
    const row = ws.addRow(rowValues);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }

  activeDepts.forEach((_, index) => {
    ws.getColumn(index + 1).width = 28;
  });

  if (activeDepts.length === 0) {
    ws.addRow(['Aucun département actif']);
  }

  const legend = wb.addWorksheet('Légende');
  legend.addRow(['Export départements / services']);
  legend.addRow(['Ligne 1', 'Nom du département (colonne)']);
  legend.addRow(['Lignes suivantes', 'Services rattachés au département']);
  legend.getRow(1).font = { bold: true };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    filename: `DEPARTEMENTS_SERVICES_${buildExportDateStamp()}.xlsx`,
  };
}
