import { refreshWithSso, LoginResult } from '../../api/auth';
import { appConfig } from '../../config/appConfig';

export interface SsoSessionData {
  guid: string;
  refresh_token: string;
}

export type SessionStatus = 'sso_available' | 'none';

export async function handleSessionStatus(
  status: SessionStatus,
  sessionData?: SsoSessionData,
  appId: string = appConfig.ssoAppId,
): Promise<LoginResult | null> {
  if (status !== 'sso_available') {
    return null;
  }

  const guid = sessionData?.guid;
  const refreshToken = sessionData?.refresh_token;
  if (!guid || !refreshToken) {
    throw new Error('missing_session_data');
  }

  return refreshWithSso(guid, refreshToken, appId);
}
