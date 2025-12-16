import React from 'react';
import { Navigate } from 'react-router-dom';
import { getAccessToken } from './tokenStorage';

interface RequireAuthProps {
  children: React.ReactElement;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const token = typeof window === 'undefined' ? null : getAccessToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
