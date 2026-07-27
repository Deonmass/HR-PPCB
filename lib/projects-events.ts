import type { ProjectRecord } from './project-types';

export const PROJECTS_BUDGET_SYNC_EVENT = 'projects:budget-sync';

export function emitProjectsBudgetSync(updatedProjects: ProjectRecord[]) {
  if (typeof window === 'undefined' || !updatedProjects.length) return;
  window.dispatchEvent(
    new CustomEvent<ProjectRecord[]>(PROJECTS_BUDGET_SYNC_EVENT, {
      detail: updatedProjects,
    }),
  );
}
