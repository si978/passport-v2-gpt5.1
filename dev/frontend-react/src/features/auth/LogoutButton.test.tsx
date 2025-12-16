import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { LogoutButton } from './LogoutButton';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

describe('LogoutButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('access_token', 'A.token');
    window.localStorage.setItem('refresh_token', 'R.token');
    window.localStorage.setItem('guid', 'G1');
    window.localStorage.setItem('account_source', 'admin');
    window.localStorage.setItem('user_type', 'admin');
    window.localStorage.setItem('admin_roles', JSON.stringify(['OPERATOR']));
    // @ts-expect-error override href for tests
    delete window.location;
    // @ts-expect-error test-only
    window.location = { href: '/' };
  });

  it('calls logout API and clears localStorage, then redirects to /login', async () => {
    (apiClient.post as any).mockResolvedValue({});

    const { findByText } = render(<LogoutButton />);

    fireEvent.click(await findByText('退出登录'));

    await vi.waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/passport/logout', {
        access_token: 'A.token',
      });
      expect(window.localStorage.getItem('access_token')).toBeNull();
      expect(window.localStorage.getItem('refresh_token')).toBeNull();
      expect(window.localStorage.getItem('guid')).toBeNull();
      expect(window.sessionStorage.getItem('access_token')).toBeNull();
      expect(window.localStorage.getItem('account_source')).toBeNull();
      expect(window.localStorage.getItem('user_type')).toBeNull();
      expect(window.localStorage.getItem('admin_roles')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });
});
