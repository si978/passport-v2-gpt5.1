import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export type AuditLogType = 'login' | 'logout' | 'ban' | 'unban' | 'sso_login';

export interface AuditLogEntry {
  type: AuditLogType;
  guid?: string;
  phone?: string;
  at: string;
  meta?: Record<string, unknown>;
}

export interface AuditLogQuery {
  type?: AuditLogType;
  guid?: string;
  phone?: string;
  start?: Date;
  end?: Date;
}

@Injectable()
export class AuditLogService {
  private entries: AuditLogEntry[] = [];

  private readonly logger = new Logger(AuditLogService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo?: Repository<AuditLog>) {}

  private now(): string {
    return new Date().toISOString();
  }

  recordLogin(guid: string, phone: string): void {
    const at = this.now();
    const entry: AuditLogEntry = { type: 'login', guid, phone, at };
    this.entries.push(entry);
    if (this.repo) {
      this.repo
        .insert({ type: 'login', guid, phone, at: new Date(at) })
        .catch((e) => this.logger.error('Failed to persist login audit log', (e as Error).stack));
    }
  }

  recordLogout(meta?: Record<string, unknown>): void {
    const at = this.now();
    const entry: AuditLogEntry = { type: 'logout', at, meta };
    this.entries.push(entry);
    if (this.repo) {
      this.repo
        .insert({ type: 'logout', at: new Date(at), meta: (meta ?? null) as any })
        .catch((e) => this.logger.error('Failed to persist logout audit log', (e as Error).stack));
    }
  }

  recordBan(guid: string, meta?: Record<string, unknown>): void {
    const at = this.now();
    const entry: AuditLogEntry = { type: 'ban', guid, at, meta };
    this.entries.push(entry);
    if (this.repo) {
      this.repo
        .insert({ type: 'ban', guid, at: new Date(at), meta: (meta ?? null) as any })
        .catch((e) => this.logger.error('Failed to persist ban audit log', (e as Error).stack));
    }
  }

  recordUnban(guid: string, meta?: Record<string, unknown>): void {
    const at = this.now();
    const entry: AuditLogEntry = { type: 'unban', guid, at, meta };
    this.entries.push(entry);
    if (this.repo) {
      this.repo
        .insert({ type: 'unban', guid, at: new Date(at), meta: (meta ?? null) as any })
        .catch((e) => this.logger.error('Failed to persist unban audit log', (e as Error).stack));
    }
  }

  recordSsoLogin(guid: string, appId: string): void {
    const at = this.now();
    const meta = { appId };
    const entry: AuditLogEntry = { type: 'sso_login', guid, at, meta };
    this.entries.push(entry);
    if (this.repo) {
      this.repo
        .insert({ type: 'sso_login', guid, at: new Date(at), meta })
        .catch((e) => this.logger.error('Failed to persist sso_login audit log', (e as Error).stack));
    }
  }

  getEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  private queryInMemory(query: AuditLogQuery = {}): AuditLogEntry[] {
    const { type, guid, phone, start, end } = query;
    return this.entries.filter((entry) => {
      if (type && entry.type !== type) return false;
      if (guid && entry.guid !== guid) return false;
      if (phone && entry.phone !== phone) return false;
      const at = new Date(entry.at);
      if (start && at < start) return false;
      if (end && at > end) return false;
      return true;
    });
  }

  async query(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
    if (!this.repo) {
      return this.queryInMemory(query);
    }

    const { type, guid, phone, start, end } = query;
    const where: any = {};
    if (type) where.type = type;
    if (guid) where.guid = guid;
    if (phone) where.phone = phone;
    if (start && end) {
      where.at = Between(start, end);
    } else if (start) {
      where.at = MoreThanOrEqual(start);
    } else if (end) {
      where.at = LessThanOrEqual(end);
    }

    try {
      const rows = await this.repo.find({ where, order: { at: 'ASC' } });
      return rows.map((row) => ({
        type: row.type as AuditLogType,
        guid: row.guid ?? undefined,
        phone: row.phone ?? undefined,
        at: row.at.toISOString(),
        meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
      }));
    } catch (e) {
      this.logger.error('Failed to query audit logs from DB, fallback to in-memory cache', (e as Error).stack);
      return this.queryInMemory(query);
    }
  }

  clear(): void {
    this.entries = [];
  }
}
