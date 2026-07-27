export interface TravelHistoryRow {
  rowIndex: number;
  date: string;
  ref: string;
  employee: string;
  department: string;
  travelDates: string;
  tripDays: number;
  totalBudget: number;
  recordId: string;
}

export interface TravelHistoryDepartmentStat {
  department: string;
  count: number;
  budget: number;
}

export interface TravelHistoryMonthlyMonth {
  key: string;
  label: string;
}

export interface TravelHistoryMonthlyDepartmentSeries {
  department: string;
  values: number[];
}

export interface TravelHistoryMonthlyTripsChart {
  years: number[];
  months: TravelHistoryMonthlyMonth[];
  byYear: Record<number, TravelHistoryMonthlyDepartmentSeries[]>;
}

export interface TravelHistoryDashboard {
  totalTrips: number;
  totalBudget: number;
  averageBudget: number;
  tripsThisMonth: number;
  budgetThisMonth: number;
  departments: TravelHistoryDepartmentStat[];
  monthlyTrips: TravelHistoryMonthlyTripsChart;
}

export interface TravelHistoryData {
  rows: TravelHistoryRow[];
  dashboard: TravelHistoryDashboard;
}
