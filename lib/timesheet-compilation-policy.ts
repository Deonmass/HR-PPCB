import type { CompilationRow, CompilationRowWeek } from './timesheet-compilation';

export interface PolicyRule {
  id: string;
  title: string;
  description: string;
}

/** Human-readable rules of the collective-agreement policy, shown in the info modal. */
export const POLICY_RULES: PolicyRule[] = [
  {
    id: 'cap-ot13',
    title: 'Plafond du taux 1.3 à 2h par semaine',
    description:
      "Le total d'heures majorées au taux 1.3 ne peut dépasser 2h par semaine. Le surplus est " +
      "automatiquement basculé au taux 1.6 et s'additionne aux heures 1.6 déjà présentes pour la même semaine.",
  },
  {
    id: 'deduction-ot16',
    title: 'Abattement conventionnel de 2h',
    description:
      "Par convention avec le syndicat, un abattement de 2h est appliqué chaque semaine sur le taux 1.6. " +
      "Si le 1.6 est à 0 (ou inférieur à 2h), le reste de l'abattement est retranché du taux 1.3. " +
      "Ainsi, lorsque le 1.3 a déjà été plafonné à 2h, il revient automatiquement à 0.",
  },
];

export const OT13_WEEKLY_CAP = 2;
/** Mandatory weekly deduction (collective agreement), taken from 1.6 first then 1.3. */
export const OT16_WEEKLY_DEDUCTION = 2;

export interface PolicyChange {
  matricule: string;
  weekPos: number;
  field: keyof CompilationRowWeek;
  from: number;
  to: number;
  reason: string;
}

export interface PolicyResult {
  rows: CompilationRow[];
  changes: PolicyChange[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applies the collective-agreement policy to a set of compilation rows.
 * Per week, in order:
 *  1. Caps the 1.3 hours at 2h, moving any surplus to 1.6.
 *  2. Applies a mandatory 2h deduction, taken from 1.6 first then, if 1.6 is
 *     insufficient, from the remaining 1.3 (so a capped 1.3 of 2h returns to 0).
 * Returns the transformed rows plus the list of changes (for highlighting/undo).
 */
export function applyCompilationPolicy(rows: CompilationRow[]): PolicyResult {
  const changes: PolicyChange[] = [];

  const transformed = rows.map((row) => {
    const weeks = row.weeks.map((week, weekPos) => {
      let ot13 = week.ot13;
      let ot16 = week.ot16;
      const push = (field: keyof CompilationRowWeek, from: number, to: number, reason: string) =>
        changes.push({ matricule: row.matricule, weekPos, field, from, to, reason });

      // Rule 1: cap 1.3 at 2h, overflow to 1.6.
      if (ot13 > OT13_WEEKLY_CAP) {
        const overflow = round2(ot13 - OT13_WEEKLY_CAP);
        const reason = `1.3 plafonné à ${OT13_WEEKLY_CAP}h : ${overflow}h reporté vers 1.6`;
        const prev13 = ot13;
        const prev16 = ot16;
        ot13 = OT13_WEEKLY_CAP;
        ot16 = round2(ot16 + overflow);
        push('ot13', prev13, ot13, reason);
        push('ot16', prev16, ot16, reason);
      }

      // Rule 2: mandatory 2h deduction — from 1.6 first, then the rest from 1.3.
      let remaining = OT16_WEEKLY_DEDUCTION;
      if (remaining > 0 && ot16 > 0) {
        const take = Math.min(ot16, remaining);
        const prev16 = ot16;
        ot16 = round2(ot16 - take);
        remaining = round2(remaining - take);
        push('ot16', prev16, ot16, `Abattement conventionnel : ${take}h retranché du 1.6`);
      }
      if (remaining > 0 && ot13 > 0) {
        const take = Math.min(ot13, remaining);
        const prev13 = ot13;
        ot13 = round2(ot13 - take);
        remaining = round2(remaining - take);
        push('ot13', prev13, ot13, `Abattement conventionnel : ${take}h retranché du 1.3 (1.6 insuffisant)`);
      }

      if (ot13 === week.ot13 && ot16 === week.ot16) return week;
      return { ...week, ot13, ot16 };
    });
    return { ...row, weeks };
  });

  return { rows: transformed, changes };
}

export function policyChangeKey(matricule: string, weekPos: number): string {
  return `${matricule}::${weekPos}`;
}
