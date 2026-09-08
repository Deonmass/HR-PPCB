/**
 * Recrutement FY27 — slide EXCO + menu Employés.
 * Champs [[...]] = mise à jour (bleu) pour export PPTX.
 */
import type { ExcoOverlays, ExcoRecruitmentRow } from './exco-types';

function rec(
  category: ExcoRecruitmentRow['category'],
  position: string,
  grade: string,
  status: string,
  comments: string,
  budgeted: string,
  department: string,
  location: string,
  contractType: string,
  idSuffix = '',
): ExcoRecruitmentRow {
  const slug = `${position}-${idSuffix || grade || location || 'x'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48);
  return {
    id: `rec-${category}-${slug}`,
    category,
    position,
    grade,
    status,
    comments,
    budgeted,
    department,
    location,
    contractType,
  };
}

/** Données recrutement Août 2026 (Replacements + New positions). */
export const DEFAULT_RECRUITMENT_ROWS: ExcoRecruitmentRow[] = [
  // —— 1. Replacements ——
  rec('replacement', 'Fitter (Plumber)', 'C2', 'Ongoing', '[[Awaiting for shortlist from the manager]]', 'Yes', 'Engineering', 'Plant', 'Permanent'),
  rec('replacement', 'Process Operator (2)', 'C1', 'Ongoing', '[[Offers to be sent]]', 'Yes', 'Production', 'Plant', 'Permanent'),
  rec('replacement', 'Shift Supervisor', 'C3', 'Ongoing', 'Awaiting for shortlist from the manager', 'Yes', 'Production', 'Plant', 'Permanent'),
  rec('replacement', 'Sales and Marketing Head', 'D5', 'Done', '', 'Yes', 'Sales and Marketing', 'HQ', 'Permanent'),
  rec('replacement', 'Logistic superintendent', 'D1', 'Cancelled', '', 'Yes', 'Supply Chain', 'HQ', 'Permanent'),
  rec('replacement', 'Instrumentation Foreman', 'C4', 'Started', '[[Interviews to be planned]]', 'Yes', 'Engineering', 'Plant', 'Permanent'),
  rec('replacement', 'Lab Analyst', 'B5', 'Done', '', 'Yes', 'QA', 'Plant', 'Outsourced', 'plant'),
  rec('replacement', 'Warehouse Officer', 'C2', 'Done', '[[Notification letter awaiting signature]]', 'Yes', 'Supply Chain', 'Kisangani', 'Outsourced'),
  rec('replacement', 'QA Manager', 'D2', 'Started', '[[Vacancy Advertised]]', 'Yes', 'QA', 'Plant', 'Permanent'),
  rec('replacement', 'Internal Auditor', '', 'Started', '[[Vacancy Advertised]]', 'Yes', 'Audit', 'HQ', 'Permanent'),
  rec('replacement', 'Legal Counsel', 'C4', 'Started', '[[Vacancy Advertised]]', 'Yes', 'Legal', 'HQ', 'Permanent'),

  // —— 2. New positions ——
  rec('new', 'Maintenance Planner', 'C2', 'Ongoing', '[[Offer to be sent]]', 'Yes', 'Engineering', 'Plant', 'Permanent'),
  rec('new', 'Mechanical foreman', 'C4', 'Started', '[[Awaiting for shortlist from the manager]]', 'No', 'Engineering', 'Plant', 'Permanent'),
  rec('new', 'Talent and development Manager', 'D2', 'Ongoing', '[[Interviews are underway]]', 'No', 'HR', 'Plant', 'Permanent'),
  rec('new', 'CPME Officer', 'C4', 'Not started', 'Vacancy to be advertised', 'Yes', 'CPME', 'Plant', 'Permanent'),
  rec('new', 'Buyer', 'C2', 'Ongoing', '[[Awaiting for shortlist from the manager]]', 'No', 'Supply chain', 'HQ', 'Permanent'),
  rec('new', 'CRO (2)', 'C2', 'Done', '', 'Yes', 'Sales and Marketing', '', ''),
  rec('new', 'Sales Consultant', 'C2', 'Ongoing', '[[Final interviews to be plan]]', 'No', 'Sales and Marketing', 'Kindu', 'Permanent'),
  rec('new', 'Warehouse operator', 'C2', 'Ongoing', 'Offer to be sent', 'No', 'Supply chain', 'Kindu', 'Permanent'),
  rec('new', 'Lab Analyst', 'B5', '', '[[Candidate did not accept the offer, vacancy to be advertised]]', 'Yes', 'QA', 'Zamba', 'Outsourced', 'zamba'),
  rec('new', 'Lab Analyst', '', 'Not started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced', 'albatros'),
  rec('new', 'Community Liaison Assistant', '', 'Not started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
  rec('new', 'Accountant – pettycash', '', 'Not started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
  rec('new', 'Logistics and Customs', '', 'Started', '[[Through Capital HR]]', 'No', 'Supply Chain', 'HQ', 'Outsourced'),
  rec('new', 'Warehouse Assistant', '', 'Not started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
];

export function resolveRecruitment(overlays: Pick<ExcoOverlays, 'recruitment'>): ExcoRecruitmentRow[] {
  return overlays.recruitment?.length ? overlays.recruitment : DEFAULT_RECRUITMENT_ROWS;
}
