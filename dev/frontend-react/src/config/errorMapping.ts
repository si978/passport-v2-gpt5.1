// Error code handling contract (aligned with refactor/contracts/errors-and-flows.md)

export type ErrorAction = 'logout' | 'retry_refresh' | 'ban' | 'app_mismatch' | 'rate_limit' | 'internal' | 'noop';

export const mapErrorToAction = (code?: string): ErrorAction => {
  if (!code) return 'noop';
  if (code === 'ERR_REFRESH_EXPIRED' || code === 'ERR_REFRESH_MISMATCH' || code === 'ERR_SESSION_NOT_FOUND') {
    return 'logout';
  }
  if (code === 'ERR_ACCESS_EXPIRED' || code === 'ERR_ACCESS_INVALID') {
    return 'retry_refresh';
  }
  if (code === 'ERR_USER_BANNED') {
    return 'ban';
  }
  if (code === 'ERR_APP_ID_MISMATCH') {
    return 'app_mismatch';
  }
  if (code === 'ERR_CODE_TOO_FREQUENT') {
    return 'rate_limit';
  }
  if (code === 'ERR_INTERNAL') {
    return 'internal';
  }
  return 'noop';
};
