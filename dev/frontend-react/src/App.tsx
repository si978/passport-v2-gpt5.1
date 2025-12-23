import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { UserListPage } from './features/admin/UserListPage';
import { UserActivityPage } from './features/admin/UserActivityPage';
import { LogoutButton } from './features/auth/LogoutButton';
import { RequireAuth } from './features/auth/RequireAuth';
import { RequireAdmin } from './features/auth/RequireAdmin';
import { AdminLayout } from './features/admin/AdminLayout';
import { SessionBanner, SessionBannerState } from './features/sso/SessionBanner';
import { handleSessionStatus } from './features/sso/ssoStartup';
import { persistSession, clearSession } from './features/auth/tokenStorage';
import { subscribeSessionStatus } from './features/sso/sessionEvents';

const warningMessages: Record<string, string> = {
  ERR_SESSION_NOT_FOUND: '当前设备无会话，请重新登录以避免串号风险。',
  ERR_ACCESS_EXPIRED: '登录会话已过期，请重新登录。',
  ERR_ACCESS_INVALID: '会话校验失败，请重新登录。',
  ERR_REFRESH_EXPIRED: '刷新令牌已过期，请重新登录。',
  ERR_REFRESH_MISMATCH: '检测到异常登录，请重新登录并确认退出上一个账号。',
};

const goLogin = () => {
  window.location.href = '/login';
};

const Home: React.FC = () => (
  <main>
    <h1>Home</h1>
    <LogoutButton />
  </main>
);

export const App: React.FC = () => {
  const [banner, setBanner] = useState<SessionBannerState>({ type: 'idle' });

  useEffect(() => {
    const unsubscribe = subscribeSessionStatus((detail) => {
      if (detail.status === 'sso_available') {
        setBanner({ type: 'info', message: '检测到可用会话，正在自动登录…' });
        handleSessionStatus('sso_available', detail.sessionData)
          .then((data) => {
            if (!data) return;
            persistSession({
              guid: data.guid,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              accountSource: data.account_source,
              userStatus: data.user_status,
              userType: data.user_type,
              roles: data.roles,
            });
            setBanner({ type: 'info', message: '已根据上次会话自动登录' });
            window.location.href = '/';
          })
          .catch(() => {
            clearSession();
            setBanner({
              type: 'warning',
              message: '自动登录失败，请重新登录并确认上一个用户已完全退出',
              actionLabel: '前往登录',
              onAction: goLogin,
            });
          });
      } else {
        clearSession();
        const message = detail.reason && warningMessages[detail.reason]
          ? warningMessages[detail.reason]
          : '当前设备无可用会话，请重新登录。';
        setBanner({ type: 'warning', message, actionLabel: '前往登录', onAction: goLogin });
      }
    });
    return unsubscribe;
  }, []);

  return (
    <BrowserRouter>
      <SessionBanner {...banner} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Home />} />
        <Route
          path="/admin"
          element={(
            <RequireAuth>
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            </RequireAuth>
          )}
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UserListPage />} />
          <Route path="activity" element={<UserActivityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
