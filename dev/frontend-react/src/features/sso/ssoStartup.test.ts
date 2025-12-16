import { describe, it, expect, vi } from 'vitest';
import { handleSessionStatus } from './ssoStartup';
import * as authApi from '../../api/auth';

describe('handleSessionStatus', () => {
  it('returns null when status is none', async () => {
    const spy = vi.spyOn(authApi, 'refreshWithSso');
    const result = await handleSessionStatus('none');
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws when session data missing', async () => {
    await expect(handleSessionStatus('sso_available')).rejects.toThrow('missing_session_data');
  });

  it('returns refresh result on success', async () => {
    vi.spyOn(authApi, 'refreshWithSso').mockResolvedValue({ guid: 'G1', access_token: 'A', refresh_token: 'R' } as any);

    const result = await handleSessionStatus('sso_available', { guid: 'G1', refresh_token: 'R.token' });

    expect(result).toEqual({ guid: 'G1', access_token: 'A', refresh_token: 'R' });
  });

  it('propagates errors from API', async () => {
    vi.spyOn(authApi, 'refreshWithSso').mockRejectedValue(new Error('fail'));

    await expect(handleSessionStatus('sso_available', { guid: 'G1', refresh_token: 'bad' })).rejects.toThrow('fail');
  });
});
