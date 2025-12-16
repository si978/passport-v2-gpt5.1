import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAdminSession } from './tokenStorage';

interface RequireAdminProps {
  children: React.ReactElement;
}

export const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const isAdmin = typeof window === 'undefined' ? false : isAdminSession();
  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
