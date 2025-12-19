const DEFAULT_ADMIN_TYPES = '9';

const adminUserTypes = new Set(
  (process.env.ADMIN_USER_TYPES ?? DEFAULT_ADMIN_TYPES)
    .split(',')
    .map((item) => parseInt(item.trim(), 10))
    .filter((value) => !Number.isNaN(value)),
);

const KNOWN_ADMIN_ROLES = new Set(['OPERATOR', 'SUPPORT', 'TECH']);

function parseAdminRoleMap(raw: string | undefined): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const text = (raw ?? '').trim();
  if (!text) return map;

  for (const part of text.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const [typeRaw, rolesRaw] = entry.split('=');
    const type = parseInt((typeRaw ?? '').trim(), 10);
    if (Number.isNaN(type)) continue;

    const roles = (rolesRaw ?? '')
      .split('|')
      .map((r) => r.trim().toUpperCase())
      .filter((r) => r.length > 0 && KNOWN_ADMIN_ROLES.has(r));

    if (roles.length > 0) {
      map.set(type, Array.from(new Set(roles)));
    }
  }
  return map;
}

const adminRoleMap = parseAdminRoleMap(process.env.ADMIN_ROLE_MAP);

function asNumber(value?: number | string | null): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function isAdminUserType(value?: number | string | null): boolean {
  if (!value) return false;
  if (typeof value === 'string' && value.toLowerCase() === 'admin') {
    return true;
  }
  const numeric = asNumber(value);
  if (numeric === null) return false;
  return adminUserTypes.has(numeric) || adminRoleMap.has(numeric);
}

export function resolveUserTypeLabel(value?: number | string | null): string {
  return isAdminUserType(value) ? 'admin' : 'user';
}

export function resolveAdminRoles(value?: number | string | null): string[] {
  if (!isAdminUserType(value)) return [];
  const numeric = asNumber(value);
  if (numeric !== null) {
    const mapped = adminRoleMap.get(numeric);
    if (mapped && mapped.length > 0) {
      return mapped;
    }
  }
  return ['OPERATOR'];
}
