import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAccessToken } from './tokenStorage';

interface RequireAuthProps {
  children: React.ReactElement;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const location = useLocation();
  const token = typeof window === 'undefined' ? null : getAccessToken();
  if (!token) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return children;
};
