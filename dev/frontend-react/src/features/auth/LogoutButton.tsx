import React from 'react';
import { apiClient } from '../../api/client';
import { clearSession, getAccessToken } from './tokenStorage';

export type LogoutButtonProps = {
  className?: string;
  label?: string;
};

export const LogoutButton: React.FC<LogoutButtonProps> = ({ className, label }) => {
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
    <button type="button" onClick={handleLogout} className={className}>
      {label ?? '退出登录'}
    </button>
  );
};
