import { SetMetadata } from '@nestjs/common';

export enum AdminRole {
  OPERATOR = 'OPERATOR',
  SUPPORT = 'SUPPORT',
  TECH = 'TECH',
}

export const ROLES_KEY = 'admin_roles';

export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
