export type AppConfig = {
  appId: string;
  ssoAppId: string;
  sessionEventName: string;
  portal: 'user' | 'admin';
};

const fallback = (value: string | undefined, defaultValue: string): string =>
  value && value.trim().length > 0 ? value : defaultValue;

function resolvePortal(appId: string): 'user' | 'admin' {
  const raw = (import.meta.env.VITE_PORTAL ?? '').trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === 'user') return 'user';
  return appId.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

export const appConfig: AppConfig = {
  appId: fallback(import.meta.env.VITE_APP_ID, 'jiuweihu'),
  ssoAppId: fallback(import.meta.env.VITE_SSO_APP_ID, 'youlishe'),
  sessionEventName: fallback(import.meta.env.VITE_SESSION_EVENT ?? 'sessionStatus', 'sessionStatus'),
  portal: resolvePortal(fallback(import.meta.env.VITE_APP_ID, 'jiuweihu')),
};

export const getAppConfig = (): AppConfig => appConfig;
