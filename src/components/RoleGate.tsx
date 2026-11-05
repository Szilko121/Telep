import React from 'react';
import { useAuth } from '@/auth/useAuth';
import type { Role } from '@/types/roles';

export const RoleGate: React.FC<React.PropsWithChildren<{ only: Role | Role[] }>> = ({ only, children }) => {
  const { hasRole } = useAuth();
  return hasRole(only) ? <>{children}</> : null;
};
