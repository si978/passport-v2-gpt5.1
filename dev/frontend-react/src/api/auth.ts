import { apiClient } from './client';

// 契约对齐：与 refactor/contracts/dto-types.md / Nest LoginResponseDto 保持一致
export type LoginResponse = {
  guid: string;
  access_token: string;
  refresh_token: string;
  user_status: 1 | 0 | -1;
  account_source: string;
  user_type?: string;
  roles?: string[];
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  expires_in?: number;
};

export async function sendCode(phone: string) {
  await apiClient.post('/passport/send-code', { phone });
}

export async function loginByPhone(phone: string, code: string, appId: string): Promise<LoginResponse> {
  const resp = await apiClient.post('/passport/login-by-phone', {
    phone,
    code,
    app_id: appId,
  });
  return resp.data as LoginResponse;
}

export async function refreshWithSso(guid: string, refreshToken: string, appId: string): Promise<LoginResponse> {
  const resp = await apiClient.post(`/passport/${guid}/refresh-token`, {
    refresh_token: refreshToken,
    app_id: appId,
    guid,
  });
  return resp.data as LoginResponse;
}
