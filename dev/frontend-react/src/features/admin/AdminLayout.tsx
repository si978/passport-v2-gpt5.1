import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoutButton } from '../auth/LogoutButton';
import './admin.css';

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 20v-1a4 4 0 0 0-3-3.87"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 19V5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 19H4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 15l4-4 3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 8v2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const AdminLayout: React.FC = () => {
  return (
    <div className="passport-admin">
      <div className="passport-admin__shell">
        <aside className="passport-admin__sider">
          <div className="passport-admin__brand">Passport 管理后台</div>
          <nav className="passport-admin__nav" aria-label="管理后台导航">
            <NavLink
              to="/admin/users"
              className={({ isActive }) => `passport-admin__navItem${isActive ? ' is-active' : ''}`}
            >
              <UsersIcon />
              用户列表
            </NavLink>
            <NavLink
              to="/admin/activity"
              className={({ isActive }) => `passport-admin__navItem${isActive ? ' is-active' : ''}`}
            >
              <ActivityIcon />
              用户活跃明细
            </NavLink>
          </nav>
        </aside>

        <div className="passport-admin__main">
          <header className="passport-admin__topbar">
            <div className="passport-admin__topbarRight">
              <span className="passport-admin__avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path
                    d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>管理员</span>
              <LogoutButton className="passport-admin__logoutBtn" label="退出" />
            </div>
          </header>

          <main className="passport-admin__content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
