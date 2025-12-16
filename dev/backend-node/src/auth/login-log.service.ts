import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { LoginLog } from './login-log.entity';

export interface LoginLogEntry {
  guid: string;
  phone: string;
  loginAt: string;
  logoutAt?: string | null;
  channel?: string | null;
  ip?: string | null;
  success: boolean;
  errorCode?: string | null;
  mac?: string | null;
  gateway?: string | null;
  cafeName?: string | null;
}

export interface LoginLogQuery {
  phone?: string;
  start?: Date;
  end?: Date;
  channel?: string;
  offset?: number;
  limit?: number;
}

@Injectable()
export class LoginLogService {
  private readonly logger = new Logger(LoginLogService.name);
  private logs: LoginLogEntry[] = [];

  constructor(@InjectRepository(LoginLog) private readonly repo?: Repository<LoginLog>) {}

  recordLogin(
    guid: string,
    phone: string,
    success: boolean,
    opts?: { channel?: string; ip?: string; errorCode?: string; mac?: string; gateway?: string; cafeName?: string; when?: Date },
  ): void {
    const when = opts?.when ?? new Date();
    const entry: LoginLogEntry = {
      guid,
      phone,
      loginAt: when.toISOString(),
      logoutAt: null,
      channel: opts?.channel ?? 'pc',
      ip: opts?.ip ?? null,
      success,
      errorCode: opts?.errorCode ?? null,
      mac: opts?.mac ?? null,
      gateway: opts?.gateway ?? null,
      cafeName: opts?.cafeName ?? null,
    };
    this.logs.push(entry);

    if (this.repo) {
      this.repo
        .insert({
          guid,
          phone,
          loginAt: when,
          logoutAt: null,
          channel: entry.channel ?? null,
          ip: entry.ip ?? null,
          success,
          errorCode: entry.errorCode ?? null,
          mac: entry.mac ?? null,
          gateway: entry.gateway ?? null,
          cafeName: entry.cafeName ?? null,
        })
        .catch((e) => this.logger.error('Failed to persist login log', (e as Error).stack));
    }
  }

  recordLogout(guid: string, phone?: string, opts?: { channel?: string; ip?: string; when?: Date }): void {
    const when = opts?.when ?? new Date();
    let matched: LoginLogEntry | undefined;
    for (let i = this.logs.length - 1; i >= 0; i -= 1) {
      const log = this.logs[i];
      if (log.guid !== guid) continue;
      if (phone && log.phone !== phone) continue;
      if (log.logoutAt) continue;
      log.logoutAt = when.toISOString();
      if (opts?.channel) {
        log.channel = opts.channel;
      }
      if (opts && Object.prototype.hasOwnProperty.call(opts, 'ip')) {
        log.ip = opts.ip ?? null;
      }
      matched = log;
      break;
    }

    if (this.repo && matched) {
      this.repo
        .update(
          { guid: matched.guid, phone: matched.phone, loginAt: new Date(matched.loginAt) },
          {
            logoutAt: when,
            channel: matched.channel ?? null,
            ip: matched.ip ?? null,
          },
        )
        .catch((e) => this.logger.error('Failed to persist logout log update', (e as Error).stack));
    }
  }

  private queryLogsInMemory(query: LoginLogQuery = {}): LoginLogEntry[] {
    const { phone, start, end, channel, offset, limit } = query;
    let result = this.logs.filter((log) => {
      if (phone && log.phone !== phone) return false;
      if (channel && log.channel !== channel) return false;
      const loginTime = new Date(log.loginAt);
      if (start && loginTime < start) return false;
      if (end && loginTime > end) return false;
      return true;
    });

    if (typeof offset === 'number' || typeof limit === 'number') {
      const startIndex = offset ?? 0;
      const endIndex = typeof limit === 'number' ? startIndex + limit : undefined;
      result = result.slice(startIndex, endIndex);
    }
    return result;
  }

  async queryLogs(query: LoginLogQuery = {}): Promise<LoginLogEntry[]> {
    if (!this.repo) {
      return this.queryLogsInMemory(query);
    }

    const { phone, start, end, channel, offset, limit } = query;

    const where: any = {};
    if (phone) where.phone = phone;
    if (channel) where.channel = channel;
    if (start && end) {
      where.loginAt = Between(start, end);
    } else if (start) {
      where.loginAt = MoreThanOrEqual(start);
    } else if (end) {
      where.loginAt = LessThanOrEqual(end);
    }

    try {
      const rows = await this.repo.find({
        where,
        order: { loginAt: 'ASC' },
        skip: offset,
        take: limit,
      });
      return rows.map((row) => ({
        guid: row.guid,
        phone: row.phone,
        loginAt: row.loginAt.toISOString(),
        logoutAt: row.logoutAt ? row.logoutAt.toISOString() : null,
        channel: row.channel ?? null,
        ip: row.ip ?? null,
        success: row.success,
        errorCode: row.errorCode ?? null,
        mac: row.mac ?? null,
        gateway: row.gateway ?? null,
        cafeName: row.cafeName ?? null,
      }));
    } catch (e) {
      this.logger.error('Failed to query login logs from DB, fallback to in-memory cache', (e as Error).stack);
      return this.queryLogsInMemory(query);
    }
  }

  clear(): void {
    this.logs = [];
  }
}
