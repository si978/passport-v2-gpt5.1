import React from 'react';
import { apiClient } from '../../api/client';
import { clearSession, getAccessToken } from './tokenStorage';

export const LogoutButton: React.FC = () => {
  const handleLogout = async () => {
    const accessToken = getAccessToken();
    try {
      await apiClient.post('/passport/logout', {
        access_token: accessToken || undefined,
      });
    } finally {
      clearSession();
      window.location.href = '/login';
    }
  };

  return (
    <button type="button" onClick={handleLogout}>
      退出登录
    </button>
  );
};
