/**
 * Applique un snapshot « New report.xlsx » sur le bloc computed EXCO.
 */
import type { ExcoWorkbookSnapshot } from './exco-new-report-parse';
import { siteBucketFromLocation, workbookEmployeesToHireList } from './exco-new-report-parse';
import type { ExcoComputedBlock, ExcoTrendMonth } from './exco-types';

function roundRate(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctFromRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return roundRate(rate * (rate <= 1 ? 100 : 1));
}

/** Feuille IN OUT renseignée (sinon on garde les mouvements calculés système). */
function workbookHasInOutData(snap: ExcoWorkbookSnapshot): boolean {
  if ((snap.inOut.inList?.length || 0) > 0 || (snap.inOut.outList?.length || 0) > 0) {
    return true;
  }
  return (snap.inOut.months || []).some(
    (m) =>
      (m.in != null && m.in > 0)
      || (m.out != null && m.out > 0)
      || (m.attritionRate != null && m.attritionRate > 0)
      || (m.turnover != null && m.turnover > 0),
  );
}

function movementRateFromCounts(
  moves: number,
  headcount: number | null | undefined,
): number | null {
  if (headcount == null || headcount <= 0) return null;
  return roundRate((moves / headcount) * 100);
}

export function applyWorkbookSnapshotToComputed(
  computed: ExcoComputedBlock,
  snap: ExcoWorkbookSnapshot,
): ExcoComputedBlock {
  const hc = snap.headcount;
  const presentList = workbookEmployeesToHireList(snap.employees);
  const plant = snap.employees.filter((e) => siteBucketFromLocation(e.locationSite) === 'Plant').length;
  const hq = snap.employees.filter((e) => siteBucketFromLocation(e.locationSite) === 'HQ and Regions').length;
  const lubudi = snap.employees.filter((e) => siteBucketFromLocation(e.locationSite) === 'Lubudi').length;
  const graduates = snap.employees.filter((e) => siteBucketFromLocation(e.locationSite) === 'Graduates').length;

  const useWorkbookInOut = workbookHasInOutData(snap);
  const currentInOut = snap.inOut.months.find((m) => m.calendarMonth === snap.params.month);
  const prevMonth = snap.params.month === 1 ? 12 : snap.params.month - 1;
  const prevInOut = snap.inOut.months.find((m) => m.calendarMonth === prevMonth);

  const hires = useWorkbookInOut
    ? (currentInOut?.in ?? snap.inOut.inList.length)
    : computed.hires;
  const exits = useWorkbookInOut
    ? (currentInOut?.out ?? snap.inOut.outList.length)
    : computed.exits;
  const prevHires = useWorkbookInOut ? (prevInOut?.in ?? null) : computed.prevHires;
  const prevExits = useWorkbookInOut ? (prevInOut?.out ?? null) : computed.prevExits;

  const genderMalePctSites = (() => {
    const plantLoc = hc.genderByLocation.find((g) => /plant/i.test(g.location));
    const lub = hc.genderByLocation.find((g) => /lubudi/i.test(g.location));
    const sitesMale = (plantLoc?.male ?? 0) + (lub?.male ?? 0);
    const sitesTotal = (plantLoc?.total ?? 0) + (lub?.total ?? 0);
    return sitesTotal ? roundRate((sitesMale / sitesTotal) * 100) : null;
  })();
  const genderFemalePctSites = (() => {
    const plantLoc = hc.genderByLocation.find((g) => /plant/i.test(g.location));
    const lub = hc.genderByLocation.find((g) => /lubudi/i.test(g.location));
    const sitesFemale = (plantLoc?.female ?? 0) + (lub?.female ?? 0);
    const sitesTotal = (plantLoc?.total ?? 0) + (lub?.total ?? 0);
    return sitesTotal ? roundRate((sitesFemale / sitesTotal) * 100) : null;
  })();
  const hqLoc = hc.genderByLocation.find((g) => /kinshasa|hq|region/i.test(g.location));
  const genderMalePctHq = hqLoc?.total ? roundRate((hqLoc.male / hqLoc.total) * 100) : null;
  const genderFemalePctHq = hqLoc?.total ? roundRate((hqLoc.female / hqLoc.total) * 100) : null;

  const next: ExcoComputedBlock = {
    ...computed,
    headcount: hc.headcount,
    prevHeadcount: useWorkbookInOut
      ? (prevInOut?.headcount ?? computed.prevHeadcount)
      : computed.prevHeadcount,
    hires,
    prevHires,
    hiresList: useWorkbookInOut ? snap.inOut.inList : computed.hiresList,
    periodHireList: useWorkbookInOut ? snap.inOut.inList : computed.periodHireList,
    presentList,
    joinersList: useWorkbookInOut ? snap.inOut.inList : computed.joinersList,
    leaversList: useWorkbookInOut ? snap.inOut.outList : computed.leaversList,
    exits,
    prevExits,
    turnoverPct: useWorkbookInOut
      ? (pctFromRate(currentInOut?.turnover ?? null) ?? computed.turnoverPct)
      : computed.turnoverPct,
    prevTurnoverPct: useWorkbookInOut
      ? (pctFromRate(prevInOut?.turnover ?? null) ?? computed.prevTurnoverPct)
      : computed.prevTurnoverPct,
    attritionPct: useWorkbookInOut
      ? (pctFromRate(currentInOut?.attritionRate ?? null) ?? computed.attritionPct)
      : computed.attritionPct,
    prevAttritionPct: useWorkbookInOut
      ? (pctFromRate(prevInOut?.attritionRate ?? null) ?? computed.prevAttritionPct)
      : computed.prevAttritionPct,
    genderMalePct: hc.malePct,
    genderFemalePct: hc.femalePct,
    genderMale: hc.male,
    genderFemale: hc.female,
    averageAge: hc.averageAge,
    averageAgeMale: hc.averageAgeMale,
    averageAgeFemale: hc.averageAgeFemale,
    averageSeniorityYears: hc.averageLengthOfService,
    ageBands: hc.ageBands,
    seniorityBands: hc.seniorityBands,
    headcountBySite: [
      { site: 'Plant', headcount: plant, delta: null },
      { site: 'HQ and Regions', headcount: hq, delta: null },
      { site: 'Lubudi', headcount: lubudi, delta: null },
      { site: 'Graduates', headcount: graduates, delta: null },
    ],
    exitsByReason: useWorkbookInOut ? snap.inOut.exitsByReason : computed.exitsByReason,
    exitsList: useWorkbookInOut ? snap.inOut.outList : computed.exitsList,
    overtimeHoursTotal: computed.overtimeHoursTotal,
    overtimeByDept: computed.overtimeByDept,
    overtimeTopEmployees: computed.overtimeTopEmployees,
    employeesWithOt: computed.employeesWithOt,
  };

  // Patch trends : démographie / coûts workbook ; mouvements seulement si IN OUT renseigné
  next.trends = computed.trends.map((t: ExcoTrendMonth) => {
    if (t.month !== snap.params.month) {
      const io = useWorkbookInOut
        ? snap.inOut.months.find((m) => m.calendarMonth === t.month)
        : undefined;
      const sc = snap.staffCost.find((s) => s.calendarMonth === t.month);
      if (!io && !sc) return t;
      const hcMonth = io?.headcount ?? t.headcount;
      const monthHires = io?.in ?? t.hires;
      const monthExits = io?.out ?? t.exits;
      const attritionFromSheet = pctFromRate(io?.attritionRate ?? null);
      const attrition =
        attritionFromSheet != null && attritionFromSheet > 0
          ? attritionFromSheet
          : monthExits > 0
            ? movementRateFromCounts(monthExits, hcMonth)
            : (attritionFromSheet ?? t.attritionPct);
      const turnoverFromSheet = pctFromRate(io?.turnover ?? null);
      const turnover =
        turnoverFromSheet != null && turnoverFromSheet > 0
          ? turnoverFromSheet
          : (monthHires + monthExits) > 0
            ? movementRateFromCounts((monthHires + monthExits) / 2, hcMonth)
            : (turnoverFromSheet ?? t.turnoverPct);
      return {
        ...t,
        headcount: hcMonth,
        hires: monthHires,
        exits: monthExits,
        attritionPct: attrition,
        turnoverPct: turnover,
        staffCost: sc?.staffCostMonth != null && sc.staffCostMonth >= 0 ? sc.staffCostMonth : t.staffCost,
        volumePerEmp: sc?.tonPerEmployee ?? t.volumePerEmp,
        revenuePerEmp: sc?.revenuePerEmployee ?? t.revenuePerEmp,
      };
    }
    return {
      ...t,
      headcount: hc.headcount,
      plant,
      hq,
      lubudi,
      graduates,
      genderMalePct: hc.malePct,
      genderFemalePct: hc.femalePct,
      genderMalePctSites,
      genderFemalePctSites,
      genderMalePctHq,
      genderFemalePctHq,
      averageAge: hc.averageAge,
      averageAgeMale: hc.averageAgeMale,
      averageAgeFemale: hc.averageAgeFemale,
      hires,
      exits,
      turnoverPct: useWorkbookInOut
        ? (pctFromRate(currentInOut?.turnover ?? null) ?? computed.turnoverPct)
        : computed.turnoverPct,
      attritionPct: useWorkbookInOut
        ? (pctFromRate(currentInOut?.attritionRate ?? null) ?? computed.attritionPct)
        : computed.attritionPct,
      overtimeHours: t.overtimeHours,
      staffCost: snap.manualKpis.staffCost ?? t.staffCost,
      volumePerEmp: snap.manualKpis.volumePerEmp ?? t.volumePerEmp,
      revenuePerEmp: snap.manualKpis.revenuePerEmp ?? t.revenuePerEmp,
      leaveBalanceAvgDays: t.leaveBalanceAvgDays,
      leaveCost: t.leaveCost,
      overtimeCost: t.overtimeCost,
      leavePlantAvgDays: t.leavePlantAvgDays,
      leaveHqAvgDays: t.leaveHqAvgDays,
      leaveLubudiAvgDays: t.leaveLubudiAvgDays,
      leaveProvisionUsd000: t.leaveProvisionUsd000,
    };
  });

  return next;
}
