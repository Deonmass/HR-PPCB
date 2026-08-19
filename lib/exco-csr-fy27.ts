import type {
  ExcoCahierHighlight,
  ExcoCahierIcon,
  ExcoCsrFy27Row,
  ExcoOverlays,
} from './exco-types';

/** Texte entre [[...]] = dernière mise à jour (affiché en bleu). */
export const CSR_UPDATE_COLOR = '1D4ED8';

export type CsrTextRun = { text: string; update?: boolean };

export function parseCsrUpdateMarkup(value: string): CsrTextRun[] {
  const src = value || '';
  const runs: CsrTextRun[] = [];
  const re = /\[\[([\s\S]*?)\]\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    if (match.index > last) runs.push({ text: src.slice(last, match.index) });
    if (match[1]) runs.push({ text: match[1], update: true });
    last = match.index + match[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  if (!runs.length) runs.push({ text: src });
  return runs;
}

export function csrTextHasUpdate(value: string | undefined): boolean {
  return /\[\[[\s\S]+?\]\]/.test(value || '');
}

export function stripCsrUpdateMarkup(value: string): string {
  return (value || '').replace(/\[\[([\s\S]*?)\]\]/g, '$1');
}

/** Slide: si la cellule a une mise à jour, n’afficher que le bleu (sans l’ancien texte noir). */
export function csrSlideText(value: string): string {
  const src = value || '';
  if (!csrTextHasUpdate(src)) return src;
  const parts = parseCsrUpdateMarkup(src)
    .filter((run) => run.update && run.text.trim())
    .map((run) => `[[${run.text.replace(/\s+/g, ' ').trim()}]]`);
  return parts.join(' ') || src;
}

export const CAHIER_ICON_OPTIONS: Array<{ id: ExcoCahierIcon; label: string }> = [
  { id: 'scholarship', label: 'Scholarship' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'leisure', label: 'Leisure' },
  { id: 'electricity', label: 'Electricity' },
];

export const DEFAULT_CSR_FY27_ROWS: ExcoCsrFy27Row[] = [
  {
    id: 'csr-fy27-scholarship',
    name: 'Scholarship Programme',
    objective: 'Provide educational support to students from host communities.',
    progress:
      'The programme is fully operational and continues to support beneficiaries in accordance with the approved framework.',
    risks: 'No significant issues reported.',
    nextSteps: 'Continue monitoring academic performance and programme compliance.',
  },
  {
    id: 'csr-fy27-zamba-tank',
    name: 'Zamba Water Tank Replacement',
    objective:
      'Replace the damaged and perforated community water tank. [[Planning the replacement of the defective and perforated tank with a new one already available.]]',
    progress:
      "A replacement tank is already available. The community has agreed on the new installation site. [[The village's agreement for the new location of the tank]]",
    risks: 'Implementation is awaiting the final Scope of Work (SOW).',
    nextSteps: 'Finalise the Scope of Work and commence installation. [[waiting for the SOW]]',
  },
  {
    id: 'csr-fy27-mwinda',
    name: 'Mwinda Partnership – Local PPE Manufacturing',
    objective:
      'Empower local women through vocational training while developing local PPE production capacity. [[Train and professionally integrate young women + produce PPE locally to reduce imports and delays]]',
    progress:
      'Procurement review concluded that Mwinda is the only qualified supplier. A Sole Supplier Justification has been prepared and submitted for approval. [[After procurement realized that Mwinda is a sole supplier, a Justification Form for Purchasing from a Sole Supplier was created and placed in the circuit for approval.]]',
    risks: 'Procurement approval pending.',
    nextSteps:
      'Complete the approval process and initiate implementation of the partnership. [[waiting for MD signature]]',
  },
  {
    id: 'csr-fy27-ppc-school',
    name: 'PPC School',
    objective:
      "Improve community education infrastructure and strengthen the school's institutional framework. [[Legal status of the school signed]]",
    progress:
      "The potable water project has been completed successfully. The school's legal documentation has been prepared. [[The contract is signed by MD]]",
    risks:
      "Awaiting the Managing Director's signature to complete the legal formalisation process. [[Waiting for the congregation's signature]]",
    nextSteps:
      "Finalise legal registration and continue supporting the school. [[Waiting for the congregation's signature]]",
  },
  {
    id: 'csr-fy27-sewing',
    name: 'Sewing Workshop',
    objective: 'Develop vocational skills and improve employability of local women.',
    progress:
      'The training programme has been successfully completed, and certificates were awarded on 27 June 2026.',
    risks: 'None.',
    nextSteps: 'Integrate graduates into the Mwinda PPE project to apply the skills acquired.',
  },
  {
    id: 'csr-fy27-infra',
    name: 'Infrastructure Programme',
    objective: 'Deliver community infrastructure projects under the Cahier des Charges.',
    progress:
      'Construction of two bridges linking Malanga Cité and Malanga Gare is progressing, with approximately 25% of clearing and stump removal completed. A third bridge has been added to facilitate access and transportation through the Malanga Gare railway corridor.',
    risks: 'Land-related disputes may delay implementation of some infrastructure works.',
    nextSteps:
      'Continue civil works while resolving outstanding community issues affecting project implementation.',
  },
  {
    id: 'csr-fy27-agri',
    name: 'Agriculture Programme',
    objective: 'Promote sustainable livelihoods through community agriculture initiatives.',
    progress:
      'Progress has been slower than anticipated due to unresolved land disputes affecting the Malanga Gare project. Discussions with Manalola confirmed that alternative implementation approaches are being explored. A possible restart of agricultural activities at Nkumba is envisaged for September. [[Resumption of agricultural activities for the communities of Nkumba and Malanga city planned for September 2026.]]',
    risks: 'Land ownership disputes remain the principal obstacle to implementation.',
    nextSteps:
      'Finalise stakeholder discussions and resume agricultural activities once community consensus has been reached.',
  },
  {
    id: 'csr-fy27-leisure',
    name: 'Sports & Leisure Facilities',
    objective: 'Promote youth development and community wellbeing through sports infrastructure.',
    progress:
      'The location for the football field at Malanga Gare has been identified and preliminary administrative procedures are underway. [[inspection visit of the soccer field to be developed in Kumba for the start of work]]',
    risks: 'No major risks identified at this stage.',
    nextSteps: 'Complete administrative approvals and commence implementation.',
  },
  {
    id: 'csr-fy27-electrification',
    name: 'Zamba & Malanga Cité Electrification Project',
    objective:
      'Improve access to electricity for surrounding communities and strengthen local infrastructure.',
    progress:
      'Overall project completion is estimated at 68%. Progress has reached approximately 85% in Zamba Phase 1 and 60% in Malanga Cité. A total of 171 houses are technically ready for connection, exceeding the initial target of 120 households. Major construction activities, including conductor delivery, transformer foundations, electrical cabins and line staking, have been completed. [[Completion: 80%. Ongoing work: Improvement of the grounding networks. Widening the control room to have access to the acquired cells. Progress status: Zamba 1st: two cabins installed, only the connection remains; Malanga Cité: send a letter to the AT of Songololo for the formalities of the new transformer location.]]',
    risks:
      'Commissioning remains dependent on the submission and approval of detailed engineering studies, validation of the 5 MVA transformer installation, grounding compliance, control building modifications and final approval of the revised implementation schedule.',
    nextSteps:
      'Finalise engineering approvals with SNEL and PPC, complete corrective technical works, validate the revised project schedule and proceed towards commissioning.',
  },
];

export const DEFAULT_CAHIER_HIGHLIGHTS: ExcoCahierHighlight[] = [
  {
    id: 'cahier-scholarship',
    icon: 'scholarship',
    title: 'Scholarship - Project fully in place',
    body: '100% in place',
    progressPct: 100,
  },
  {
    id: 'cahier-infra',
    icon: 'infrastructure',
    title: 'Infrastructure',
    body: 'the construction of two bridges connecting Malanga Cité and Malanga Gare. 25% of the work, in terms of clearing and stump removal, is completed. A second project has been added to this. It involves the construction of a third bridge to facilitate both the evacuation and the transport of our products via the Malanga Gare railway. Negotiations with the residents of Kuzi were ongoing, but after a meeting held on this issue on Saturday, July 4th at Malanga Gare, we were informed that there is a land dispute between the lineages.',
    progressPct: 100,
  },
  {
    id: 'cahier-agri',
    icon: 'agriculture',
    title: 'Agriculture -',
    body: 'An online meeting was held with the Manalola organization, from which the lack of progress in the agricultural project was noted following land conflicts. A discussion about another methodology is underway to successfully carry the project through. However, we hope that a possible resumption of agricultural activities planned in Nkumba will take place in September as planned. [[Resumption of agricultural activities for the communities of Nkumba and Malanga city planned for September 2026.]]',
    progressPct: 75,
  },
  {
    id: 'cahier-leisure',
    icon: 'leisure',
    title: 'Leisure',
    body: 'Malanga Gare, the place has been indicated to set up a football field. The procedures are underway. [[inspection visit of the soccer field to be developed in Kumba for the start of work]]',
    progressPct: 50,
  },
  {
    id: 'cahier-electricity',
    icon: 'electricity',
    title: 'Electricity',
    body: '[[Completion: 80%. Ongoing work: Improvement of the grounding networks. Widening the control room to have access to the acquired cells. Progress status: Zamba 1st: two cabins installed, only the connection remains; Malanga Cité: send a letter to the AT of Songololo for the formalities of the new transformer location.]]',
    progressPct: 80,
  },
];

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const CAHIER_ICONS = new Set<ExcoCahierIcon>([
  'scholarship',
  'infrastructure',
  'agriculture',
  'leisure',
  'electricity',
]);

export function normalizeCsrFy27Rows(raw: unknown): ExcoCsrFy27Row[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const r = (row && typeof row === 'object' ? row : {}) as Partial<ExcoCsrFy27Row>;
    return {
      id: asText(r.id) || `csr-fy27-${i + 1}`,
      name: asText(r.name),
      objective: asText(r.objective),
      progress: asText(r.progress),
      risks: asText(r.risks),
      nextSteps: asText(r.nextSteps),
    };
  });
}

export function normalizeCahierHighlights(raw: unknown): ExcoCahierHighlight[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const r = (row && typeof row === 'object' ? row : {}) as Partial<ExcoCahierHighlight>;
    const icon = CAHIER_ICONS.has(r.icon as ExcoCahierIcon)
      ? (r.icon as ExcoCahierIcon)
      : 'infrastructure';
    return {
      id: asText(r.id) || `cahier-${i + 1}`,
      icon,
      title: asText(r.title),
      body: asText(r.body),
      progressPct: asPct(r.progressPct),
    };
  });
}

export function resolveCsrFy27Rows(overlays: Pick<ExcoOverlays, 'csrFy27Rows'>): ExcoCsrFy27Row[] {
  return overlays.csrFy27Rows?.length ? overlays.csrFy27Rows : DEFAULT_CSR_FY27_ROWS;
}

export function resolveCahierHighlights(
  overlays: Pick<ExcoOverlays, 'cahierHighlights'>,
): ExcoCahierHighlight[] {
  return overlays.cahierHighlights?.length
    ? overlays.cahierHighlights
    : DEFAULT_CAHIER_HIGHLIGHTS;
}

export function emptyCsrFy27Row(id: string): ExcoCsrFy27Row {
  return { id, name: '', objective: '', progress: '', risks: '', nextSteps: '' };
}

export function emptyCahierHighlight(id: string): ExcoCahierHighlight {
  return { id, icon: 'infrastructure', title: '', body: '', progressPct: 0 };
}
