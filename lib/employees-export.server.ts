import 'server-only';

import {
  buildEmployeesHrExportBuffer,
  buildEmployeesHrExportFilename,
} from './employees-export-xlsx.server';

export { buildEmployeesHrExportFilename };

export async function buildEmployeesExportBuffer(): Promise<Buffer> {
  return buildEmployeesHrExportBuffer();
}
