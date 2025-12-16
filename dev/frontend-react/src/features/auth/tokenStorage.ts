const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const GUID_KEY = 'guid';
const ACCOUNT_SOURCE_KEY = 'account_source';
const USER_STATUS_KEY = 'user_status';
const USER_TYPE_KEY = 'user_type';
const ADMIN_ROLES_KEY = 'admin_roles';

export type StoredSession = {
  guid: string;
  accessToken: string;
  refreshToken: string;
  accountSource?: string | null;
  userStatus?: 1 | 0 | -1 | null;
  userType?: string | null;
  roles?: string[] | null;
};

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const sessionStorage = () => (typeof window === 'undefined' ? null : window.sessionStorage);

const migrateAccessToken = () => {
  const store = storage();
  const sessionStore = sessionStorage();
  if (!store || !sessionStore) return;
  const legacy = sessionStore.getItem(ACCESS_KEY);
  if (legacy && !store.getItem(ACCESS_KEY)) {
    store.setItem(ACCESS_KEY, legacy);
    sessionStore.removeItem(ACCESS_KEY);
  }
};

export const persistSession = (payload: StoredSession) => {
  const store = storage();
  if (!store) return;
  store.setItem(ACCESS_KEY, payload.accessToken);
  store.setItem(REFRESH_KEY, payload.refreshToken);
  store.setItem(GUID_KEY, payload.guid);
  if (payload.accountSource) {
    store.setItem(ACCOUNT_SOURCE_KEY, payload.accountSource);
  } else {
    store.removeItem(ACCOUNT_SOURCE_KEY);
  }
  if (typeof payload.userStatus === 'number') {
    store.setItem(USER_STATUS_KEY, String(payload.userStatus));
  } else {
    store.removeItem(USER_STATUS_KEY);
  }
  if (payload.userType) {
    store.setItem(USER_TYPE_KEY, payload.userType);
  } else {
    store.removeItem(USER_TYPE_KEY);
  }
  if (payload.roles && payload.roles.length > 0) {
    store.setItem(ADMIN_ROLES_KEY, JSON.stringify(payload.roles));
  } else {
    store.removeItem(ADMIN_ROLES_KEY);
  }
};

export const clearSession = () => {
  const store = storage();
  const sessionStore = sessionStorage();
  [store, sessionStore].forEach((target) => {
    target?.removeItem(ACCESS_KEY);
    target?.removeItem(REFRESH_KEY);
    target?.removeItem(GUID_KEY);
  });
  store?.removeItem(ACCOUNT_SOURCE_KEY);
  store?.removeItem(USER_STATUS_KEY);
  store?.removeItem(USER_TYPE_KEY);
  store?.removeItem(ADMIN_ROLES_KEY);
};

export const getAccessToken = (): string | null => {
  migrateAccessToken();
  return storage()?.getItem(ACCESS_KEY) ?? null;
};

export const getRefreshToken = (): string | null => storage()?.getItem(REFRESH_KEY) ?? null;

export const getGuid = (): string | null => storage()?.getItem(GUID_KEY) ?? null;

export const getAccountSource = (): string | null => storage()?.getItem(ACCOUNT_SOURCE_KEY) ?? null;

export const getUserStatus = (): number | null => {
  const raw = storage()?.getItem(USER_STATUS_KEY);
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

export const getUserType = (): string | null => storage()?.getItem(USER_TYPE_KEY) ?? null;

export const getAdminRoles = (): string[] => {
  const raw = storage()?.getItem(ADMIN_ROLES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : raw.split(',');
  } catch {
    return raw.split(',');
  }
};

export const setAdminRoles = (roles: string[] | null) => {
  const store = storage();
  if (!store) return;
  if (roles && roles.length) {
    store.setItem(ADMIN_ROLES_KEY, JSON.stringify(roles));
  } else {
    store.removeItem(ADMIN_ROLES_KEY);
  }
};

export const getAdminRole = (): string | null => getAdminRoles()[0] ?? null;

export const isAdminSession = (): boolean => {
  const accountSource = getAccountSource();
  if (accountSource && accountSource.toLowerCase() === 'admin') {
    return true;
  }
  const roles = getAdminRoles();
  if (roles.length > 0) {
    return true;
  }
  const userType = getUserType();
  return userType?.toLowerCase() === 'admin';
};
