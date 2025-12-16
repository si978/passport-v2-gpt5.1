export interface AppSession {
  accessToken: string;
  accessTokenExpiresAt: string; // ISO8601
  lastActiveAt: string;
}

export interface Session {
  guid: string;
  refreshToken: string;
  refreshTokenExpiresAt: string; // ISO8601
  userType?: number;
  accountSource?: string;
  roles?: string[];
  apps: Record<string, AppSession>;
}
