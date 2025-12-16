import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { SessionStore } from './session-store';
import { LoginLogService } from './login-log.service';

export type AdminUserStatus = 'ACTIVE' | 'BANNED' | 'DELETED';

function toNumericStatus(status: AdminUserStatus): number {
  switch (status) {
    case 'ACTIVE':
      return 1;
    case 'BANNED':
      return 0;
    case 'DELETED':
      return -1;
  }
}

function toAdminStatus(status: number): AdminUserStatus {
  if (status === 1) return 'ACTIVE';
  if (status === 0) return 'BANNED';
  return 'DELETED';
}

export interface AdminUserView {
  guid: string;
  phone: string;
  status: AdminUserStatus;
  account_source: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sessions: SessionStore,
    private readonly loginLogs: LoginLogService,
  ) {}

  async listUsers(status?: AdminUserStatus): Promise<AdminUserView[]> {
    const where: any = {};
    if (status !== undefined) {
      where.status = toNumericStatus(status);
    }
    const rows = await this.users.find({ where, order: { createdAt: 'ASC', phone: 'ASC' } });
    return rows.map((u) => ({
      guid: u.guid,
      phone: u.phone,
      status: toAdminStatus(u.status),
      account_source: u.accountSource,
    }));
  }

  async banUser(guid: string): Promise<void> {
    const user = await this.users.findOne({ where: { guid } });
    if (!user) return;
    user.status = 0;
    await this.users.save(user);
    await this.sessions.delete(guid);
  }

  async unbanUser(guid: string): Promise<void> {
    const user = await this.users.findOne({ where: { guid } });
    if (!user) return;
    user.status = 1;
    await this.users.save(user);
  }

  async listActivity(filters?: {
    phone?: string;
    start?: Date;
    end?: Date;
    channel?: string;
  }): Promise<
    Array<{
      guid: string;
      phone: string;
      login_at: string;
      logout_at?: string | null;
      channel?: string | null;
      ip?: string | null;
      mac?: string | null;
      gateway?: string | null;
      cafe_name?: string | null;
    }>
  > {
    const logs = await this.loginLogs.queryLogs(filters ?? {});
    return logs.map((log) => ({
      guid: log.guid,
      phone: log.phone,
      login_at: log.loginAt,
      logout_at: log.logoutAt ?? null,
      channel: log.channel ?? null,
      ip: log.ip ?? null,
      mac: log.mac ?? null,
      gateway: log.gateway ?? null,
      cafe_name: log.cafeName ?? null,
    }));
  }
}
