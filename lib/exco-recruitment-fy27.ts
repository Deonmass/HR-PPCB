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

/** Slide Recruitment FY27 — champs [[...]] = mise à jour (bleu, non gras). */
export const DEFAULT_RECRUITMENT_ROWS: ExcoRecruitmentRow[] = [
  rec('replacement', 'Fitter (Plumber)', 'C2', '[[Ongoing]]', '[[Shortlisting done, interview to be planned]]', 'Yes', 'Engineering', 'Plant', 'Permanent'),
  rec('replacement', 'Process Operator (2)', 'C1', '[[Ongoing]]', '[[First interviews done, second round interview ongoing with Mr. Andrew]]', 'Yes', 'Production', 'Plant', 'Permanent'),
  rec('replacement', 'Shift Supervisor', 'C3', 'Ongoing', '[[Awaiting for shortlist from the manager]]', 'Yes', 'Production', 'Plant', 'Permanent'),
  rec('replacement', 'Sales and Marketing Head', 'D5', 'Ongoing', 'Interviews done', 'Yes', 'Sales and Marketing', 'HQ', 'Permanent'),
  rec('replacement', 'Logistic superintendent', 'D1', 'Ongoing', '[[Interviews done, offer to be sent]]', 'Yes', 'Supply Chain', 'HQ', 'Permanent'),
  rec('replacement', 'Instrumentation Foreman', 'C4', 'Started', '[[Waiting for the shortlisting from the manager]]', 'yes', 'Engineering', 'Plant', 'Permanent'),
  rec('replacement', 'Lab Analyst', 'B5', '[[Done]]', '[[Offer sent and starting soon]]', 'yes', 'QA', 'Plant', 'Permanent'),
  rec('replacement', 'Warehouse Officer', 'C2', '[[Done]]', '[[Notification letter sent, candidate starting soon]]', 'yes', 'Supply Chain', 'Kisangani', 'Outsourced'),

  rec('new', 'Maintenance Planner', 'C2', 'Ongoing', 'Second interviews are to be scheduled.', 'Yes', 'Engineering', 'Plant', 'Permanent'),
  rec('new', 'Mechanical foreman', 'C4', '[[Started]]', '[[Vacancy advertised]]', 'No', 'Engineering', 'Plant', 'Permanent'),
  rec('new', 'Quality Manager', 'D2', '[[Started]]', '[[Vacancy advertised]]', 'No', 'QA', 'Plant', 'Permanent'),
  rec('new', 'Talent and development Manager', 'D2', '[[Started]]', '[[Vacancy advertised]]', 'No', 'HR', 'Plant', 'Permanent'),
  rec('new', 'CPME Officer', 'C4', '[[Not started]]', 'Vacancy to be advertised', 'Yes', 'CPME', 'Plant', 'Permanent'),
  rec('new', 'Buyer', 'C2', 'Ongoing', '[[Interviews to be planned]]', 'No', 'Supply chain', 'HQ', 'Permanent'),
  rec('new', 'CRO (2)', 'C2', 'Ongoing', '[[Offer sent, waiting for response]]', 'yes', 'Sales and Marketing', '', 'Permanent'),
  rec('new', 'Sales Consultant', 'C2', 'Ongoing', 'Final Interviews pending MD\'s availability', 'No', 'Sales and Marketing', 'Kindu', 'Permanent'),
  rec('new', 'Warehouse operator', 'C2', 'Ongoing', 'Offer to be sent', 'No', 'Supply chain', 'Kindu', 'Permanent'),
  rec('new', 'Lab Analyst', 'B5', 'Ongoing', '[[Candidate did not accept the offer, vacancy to be advertised]]', 'yes', 'QA', 'Zamba', 'Permanent'),
  rec('new', 'Lab Analyst', '', 'Not Started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
  rec('new', 'Community Liaison Assistant', '', 'Not Started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
  rec('new', 'Accountant – pettycash', '', 'Not Started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
  rec('new', 'Logistics and Customs', '', 'Started', '[[Through Capital HR]]', 'No', 'Supply Chain', 'HQ', 'Outsourced'),
  rec('new', 'Warehouse Assistant', '', 'Not Started', '[[Through Capital HR]]', 'No', 'Albatros', 'Lubudi – Grand Katanga', 'Outsourced'),
];

export function resolveRecruitment(overlays: Pick<ExcoOverlays, 'recruitment'>): ExcoRecruitmentRow[] {
  return overlays.recruitment?.length ? overlays.recruitment : DEFAULT_RECRUITMENT_ROWS;
}
