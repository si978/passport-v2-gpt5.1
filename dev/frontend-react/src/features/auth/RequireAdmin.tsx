import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAdminSession } from './tokenStorage';

interface RequireAdminProps {
  children: React.ReactElement;
}

export const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const location = useLocation();
  const isAdmin = typeof window === 'undefined' ? false : isAdminSession();
  if (!isAdmin) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
};
