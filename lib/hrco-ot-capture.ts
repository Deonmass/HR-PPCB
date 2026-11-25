/**
 * Heures supplémentaires janvier–octobre 2026, tableau transmis pour la note HRCO.
 * Les mois sont indicés 1–10. Un écart de lecture est ajouté au détail quand
 * le total du tableau ne se reconstitue pas uniquement avec les mois lisibles.
 */
export type HrcoOtCaptureDept = {
  department: string;
  hours: Array<number | null>;
  cost: Array<number | null>;
  totalHours: number;
  totalCost: number;
};

const EMPTY = Array.from({ length: 10 }, () => null as number | null);

function row(
  department: string,
  hours: Array<number | null>,
  cost: Array<number | null>,
  totalHours: number,
  totalCost: number,
): HrcoOtCaptureDept {
  return { department, hours, cost, totalHours, totalCost };
}

export const HRCO_OT_CAPTURE: HrcoOtCaptureDept[] = [
  row('CEC', [0, 0, 0, null, 16, 0, 0, null, null, 0], [null, null, null, null, 240.39, null, null, null, null, null], 16, 240.39),
  row(
    'Engineering',
    [241.56, 679.67, 356.34, 356.34, 538.73, 784.18, 639.19, 441.67, 494.2, 228.99],
    [2706.97, 6749.59, 3832.88, 3807.7, 5326.22, 8020.62, 6262.87, 4151.44, null, 2480.03],
    4760.87,
    43338.32,
  ),
  row(
    'Mining',
    [0, 184.49, 0, 64, 52.3, 60, 57.3, 95.31, 16, 0],
    [null, 1609.92, null, 513.25, 402.22, 586.04, 430.45, null, null, 51.06],
    529.4,
    3592.95,
  ),
  row(
    'Optimization',
    [16.13, 0, 0, null, -6.3, 0, 0, 0, 0, null],
    [117.4, null, null, null, -45.85, null, null, null, null, null],
    22.43,
    163.25,
  ),
  row(
    'Production',
    [493.79, 287.93, 53.06, 53.06, 241.41, 163.52, 378.92, 439.72, 449.89, 113.53],
    [4866.24, 2614.06, 624.13, 620.03, 2296.81, 1749.33, 3481.92, 3871.68, null, 1118.26],
    2674.83,
    21242.45,
  ),
  row(
    'Logistic',
    [68.31, 48.11, 57.99, 57.99, 128.91, 82.24, 65.57, 44.63, 67.26, 63.04],
    [706.88, 458.55, 642.17, 637.96, 1084.99, 824.62, 716.6, 452.87, 766, 662.68],
    684.05,
    6953.32,
  ),
  row(
    'Quality Assurance',
    [157.99, 193.83, 68.58, 68.58, 53.97, 101.13, 111, 108, 107.78, 48.62],
    [988.97, 1330.3, 549.05, 545.44, 575.12, 774.63, 942.05, 858.55, null, 402.05],
    1019.48,
    6966.15,
  ),
  row('SHE', [null, null, null, null, null, null, null, null, null, 4.3], [null, null, null, null, null, null, null, null, null, 67.97], 4.3, 67.97),
  row('Finance', [null, null, null, null, null, null, null, null, null, 14], [null, null, null, null, null, null, null, null, null, 226.12], 14, 226.12),
];

export const HRCO_OT_CAPTURE_HOURS = 9725.36;
export const HRCO_OT_CAPTURE_COST = 82790.93;

export { EMPTY as HRCO_OT_EMPTY_MONTHS };
