// Passport cross-implementation contracts (aligned with refactor/contracts)
// These interfaces give a single source for DTO shapes and error responses
// so controllers/services can stay consistent with Python reference and docs.

export enum ContractAuthErrorCode {
  ERR_CODE_INVALID = 'ERR_CODE_INVALID',
  ERR_CODE_EXPIRED = 'ERR_CODE_EXPIRED',
  ERR_CODE_TOO_FREQUENT = 'ERR_CODE_TOO_FREQUENT',
  ERR_PHONE_INVALID = 'ERR_PHONE_INVALID',
  ERR_USER_BANNED = 'ERR_USER_BANNED',
  ERR_REFRESH_EXPIRED = 'ERR_REFRESH_EXPIRED',
  ERR_REFRESH_MISMATCH = 'ERR_REFRESH_MISMATCH',
  ERR_APP_ID_MISMATCH = 'ERR_APP_ID_MISMATCH',
  ERR_ACCESS_EXPIRED = 'ERR_ACCESS_EXPIRED',
  ERR_ACCESS_INVALID = 'ERR_ACCESS_INVALID',
  ERR_SESSION_NOT_FOUND = 'ERR_SESSION_NOT_FOUND',
  ERR_INTERNAL = 'ERR_INTERNAL',
}

export type LoginByPhoneRequest = {
  phone: string;
  code: string;
  app_id: string;
};

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

export type RefreshTokenRequest = {
  guid: string;
  refresh_token: string;
  app_id: string;
};

export type RefreshTokenResponse = LoginResponse;

export type LogoutByGuidRequest = { guid: string };
export type LogoutByAccessTokenRequest = { access_token: string };

export type VerifyAccessTokenRequest = {
  access_token: string;
  app_id: string;
};

export type VerifyAccessTokenResponse = {
  guid: string;
  app_id: string;
  expires_at: string;
};

export type ErrorResponse = {
  code: ContractAuthErrorCode | string;
  message: string;
  trace_id?: string;
  detail?: unknown;
};

// Note: Service/controller DTO classes can `implements` these interfaces
// to keep Swagger decorators while staying aligned with contract types.
