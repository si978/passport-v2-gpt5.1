const DEFAULT_ADMIN_TYPES = '9';

const adminUserTypes = new Set(
  (process.env.ADMIN_USER_TYPES ?? DEFAULT_ADMIN_TYPES)
    .split(',')
    .map((item) => parseInt(item.trim(), 10))
    .filter((value) => !Number.isNaN(value)),
);

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
  return adminUserTypes.has(numeric);
}

export function resolveUserTypeLabel(value?: number | string | null): string {
  return isAdminUserType(value) ? 'admin' : 'user';
}

export function resolveAdminRoles(value?: number | string | null): string[] {
  return isAdminUserType(value) ? ['OPERATOR'] : [];
}
