export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isBoolMap(value: unknown): value is Record<string, boolean> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.every((key) => typeof value[key] === 'boolean');
}

export function isObjectArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isPlainObject(item));
}

const WRAPPER_HINTS = [
  'employees',
  'roles',
  'users',
  'departments',
  'services',
  'entries',
  'items',
  'records',
  'rows',
  'dependants',
  'exits',
  'projects',
  'vehicles',
  'factures',
  'notes',
  'costCenters',
  'sessions',
];

export function parseJsonText(text: string): { data: unknown; error: string | null } {
  try {
    return { data: JSON.parse(text) as unknown, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'JSON invalide' };
  }
}

export function stringifyJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function unwrapCollection(data: unknown): {
  wrapperKey: string | null;
  rows: Record<string, unknown>[];
} {
  if (isObjectArray(data)) return { wrapperKey: null, rows: data };
  if (!isPlainObject(data)) return { wrapperKey: null, rows: [] };

  for (const hint of WRAPPER_HINTS) {
    const value = data[hint];
    if (isObjectArray(value)) return { wrapperKey: hint, rows: value };
  }

  const arrays = Object.entries(data).filter(([, value]) => isObjectArray(value)) as Array<
    [string, Record<string, unknown>[]]
  >;
  if (arrays.length === 1) return { wrapperKey: arrays[0][0], rows: arrays[0][1] };
  if (arrays.length > 1) {
    arrays.sort((a, b) => b[1].length - a[1].length);
    return { wrapperKey: arrays[0][0], rows: arrays[0][1] };
  }
  return { wrapperKey: null, rows: [] };
}

export function replaceCollection(
  data: unknown,
  wrapperKey: string | null,
  rows: Record<string, unknown>[],
): unknown {
  if (wrapperKey && isPlainObject(data)) return { ...data, [wrapperKey]: rows };
  return rows;
}

export function getByPath(row: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return row[path];
  const [head, ...rest] = path.split('.');
  const nested = row[head];
  if (!isPlainObject(nested)) return undefined;
  return rest.reduce<unknown>((acc, key) => (isPlainObject(acc) ? acc[key] : undefined), nested);
}

export function setByPath(
  row: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  if (!path.includes('.')) return { ...row, [path]: value };
  const [head, ...rest] = path.split('.');
  const nested = isPlainObject(row[head]) ? { ...row[head] } : {};
  let cursor: Record<string, unknown> = nested;
  rest.slice(0, -1).forEach((key) => {
    cursor[key] = isPlainObject(cursor[key]) ? { ...cursor[key] } : {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[rest[rest.length - 1]] = value;
  return { ...row, [head]: nested };
}

export function tableColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 80)) {
    for (const [key, value] of Object.entries(row)) {
      if (isBoolMap(value)) {
        for (const sub of Object.keys(value)) keys.add(`${key}.${sub}`);
      } else if (Array.isArray(value) || (isPlainObject(value) && !isBoolMap(value))) {
        continue;
      } else {
        keys.add(key);
      }
    }
  }
  const preferred = ['matricule', 'nom', 'label', 'roleName', 'username', 'name', 'menuId', 'id'];
  return [...keys].sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'fr');
  });
}

export function rowTitle(row: Record<string, unknown>, index: number): string {
  for (const key of ['nom', 'label', 'roleName', 'displayName', 'username', 'name', 'title', 'matricule', 'menuId', 'id']) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return `Fiche ${index + 1}`;
}

export function looksLikeMenuList(value: unknown): value is Record<string, unknown>[] {
  if (!isObjectArray(value) || value.length === 0) return false;
  const sample = value.slice(0, 8);
  return sample.every(
    (item) =>
      typeof item.menuId === 'string'
      && isBoolMap(item.actions),
  );
}
