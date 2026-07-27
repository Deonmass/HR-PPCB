import type { MenuPermission, PermissionAction } from './auth-types';

export function canPerformAction(
  menus: MenuPermission[] | null | undefined,
  menuId: string,
  action: PermissionAction,
): boolean {
  if (!menus?.length) return false;
  const menu = menus.find((item) => item.menuId === menuId);
  return Boolean(menu?.actions[action]);
}

export function buildPermissionMap(
  menus: MenuPermission[],
): Map<string, Record<PermissionAction, boolean>> {
  const map = new Map<string, Record<PermissionAction, boolean>>();
  for (const menu of menus) {
    map.set(menu.menuId, { ...menu.actions });
  }
  return map;
}
