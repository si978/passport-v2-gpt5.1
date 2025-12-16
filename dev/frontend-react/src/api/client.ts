import axios from 'axios';
import {
  clearSession,
  getAccessToken,
  getAdminRole,
  getGuid,
  getRefreshToken,
  persistSession,
} from '../features/auth/tokenStorage';
import { appConfig } from '../config/appConfig';
import { emitSessionStatus } from '../features/sso/sessionEvents';
import type { AxiosError } from 'axios';
import { mapErrorToAction } from '../config/errorMapping';

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: false,
  timeout: 30000,
});

const rawClient = axios.create({
  baseURL: '/api',
  withCredentials: false,
  timeout: 30000,
});

type RefreshTokenResponse = {
  guid: string;
  access_token: string;
  refresh_token: string;
  account_source?: string;
  user_status?: 1 | 0 | -1;
  user_type?: string;
  roles?: string[];
};

let refreshInFlight: Promise<void> | null = null;

const refreshAccessToken = async () => {
  const guid = getGuid();
  const refreshToken = getRefreshToken();
  if (!guid || !refreshToken) {
    throw new Error('no refresh token');
  }

  const resp = await rawClient.post(`/passport/${guid}/refresh-token`, {
    guid,
    refresh_token: refreshToken,
    app_id: appConfig.appId,
  });

  const data = resp.data as RefreshTokenResponse;
  persistSession({
    guid: data.guid,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountSource: data.account_source,
    userStatus: data.user_status,
    userType: data.user_type,
    roles: data.roles,
  });
};

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  const headers: any = config.headers;

  const accessToken = getAccessToken();
  if (accessToken && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  // 默认附带应用标识，便于后端 AuthGuard 校验 app_id。
  if (!headers['x-app-id']) {
    headers['x-app-id'] = appConfig.appId;
  }

  const adminRole = getAdminRole();
  if (adminRole && !headers['x-admin-role']) {
    headers['x-admin-role'] = adminRole;
  }

  return config;
});

apiClient.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError<any>) => {
    const resp = error.response;
    const data = resp?.data || {};
    const code: string | undefined = data.code || data.error_code;
    const action = mapErrorToAction(code);

    switch (action) {
      case 'logout': {
        clearSession();
        emitSessionStatus({ status: 'none', reason: code });
        window.location.href = '/login';
        return Promise.reject(error);
      }
      case 'ban': {
        clearSession();
        emitSessionStatus({ status: 'banned', reason: code });
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
      case 'retry_refresh': {
        // Access 令牌失效：优先尝试刷新并重放原请求；失败则登出回登录页。
        const original = error.config;
        if (!original) return Promise.reject(error);
        if ((original as any).__passportRetried) return Promise.reject(error);
        (original as any).__passportRetried = true;

        try {
          if (!refreshInFlight) {
            refreshInFlight = refreshAccessToken().finally(() => {
              refreshInFlight = null;
            });
          }
          await refreshInFlight;

          const accessToken = getAccessToken();
          if (accessToken) {
            original.headers = original.headers ?? {};
            (original.headers as any).authorization = `Bearer ${accessToken}`;
          }

          return apiClient.request(original);
        } catch {
          clearSession();
          emitSessionStatus({ status: 'none', reason: code });
          window.location.href = '/login';
          return Promise.reject(error);
        }
      }
      case 'app_mismatch': {
        alert('当前应用无权限访问该资源');
        return Promise.reject(error);
      }
      case 'rate_limit': {
        alert('操作过于频繁，请稍后再试');
        return Promise.reject(error);
      }
      case 'internal': {
        alert('系统繁忙，请稍后再试');
        return Promise.reject(error);
      }
      case 'noop':
      default:
        return Promise.reject(error);
    }
  },
);
