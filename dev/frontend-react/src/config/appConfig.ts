export type AppConfig = {
  appId: string;
  ssoAppId: string;
  sessionEventName: string;
};

const fallback = (value: string | undefined, defaultValue: string): string =>
  value && value.trim().length > 0 ? value : defaultValue;

export const appConfig: AppConfig = {
  appId: fallback(import.meta.env.VITE_APP_ID, 'jiuweihu'),
  ssoAppId: fallback(import.meta.env.VITE_SSO_APP_ID, 'youlishe'),
  sessionEventName: fallback(import.meta.env.VITE_SESSION_EVENT ?? 'sessionStatus', 'sessionStatus'),
};

export const getAppConfig = (): AppConfig => appConfig;
