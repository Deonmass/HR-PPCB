export const MISSION_REF_PREFIX = 'PPCB-DOC-HR-ZA';

const MISSION_REF_PATTERN = /^PPCB-DOC-HR-ZA\/(\d{3})\/(\d{2})\/(\d{4})$/;

export function formatMissionRef(sequence: number, date: Date = new Date()): string {
  const seq = String(Math.max(1, sequence)).padStart(3, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${MISSION_REF_PREFIX}/${seq}/${month}/${year}`;
}

export function parseMissionRef(ref: string): { sequence: number; month: number; year: number } | null {
  const match = ref.trim().match(MISSION_REF_PATTERN);
  if (!match) return null;
  return {
    sequence: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    year: Number.parseInt(match[3], 10),
  };
}

export function nextMissionSequence(existingRefs: string[], date: Date = new Date()): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  let max = 0;
  for (const ref of existingRefs) {
    const parsed = parseMissionRef(ref);
    if (!parsed || parsed.month !== month || parsed.year !== year) continue;
    max = Math.max(max, parsed.sequence);
  }
  return max + 1;
}
