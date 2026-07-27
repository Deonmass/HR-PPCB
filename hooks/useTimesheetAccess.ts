'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TimesheetAccessContext, TimesheetViewScope } from '@/lib/timesheet-permissions';
import type { Employee } from '@/lib/types';

export interface TimesheetAccessState {
  loading: boolean;
  scope: TimesheetViewScope | null;
  linkedEmployee: Employee | null;
  department: string | null;
  permissions: TimesheetAccessContext['permissions'] | null;
}

const EMPTY_STATE: TimesheetAccessState = {
  loading: true,
  scope: null,
  linkedEmployee: null,
  department: null,
  permissions: null,
};

export function useTimesheetAccess() {
  const [state, setState] = useState<TimesheetAccessState>(EMPTY_STATE);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/timesheet/me');
      if (!res.ok) {
        setState({ ...EMPTY_STATE, loading: false });
        return;
      }
      const json = (await res.json()) as {
        scope: TimesheetViewScope;
        employee: Employee | null;
        department: string | null;
        permissions: TimesheetAccessContext['permissions'];
      };
      setState({
        loading: false,
        scope: json.scope,
        linkedEmployee: json.employee,
        department: json.department,
        permissions: json.permissions,
      });
    } catch {
      setState({ ...EMPTY_STATE, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
