import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return false;

  const normalized = normalizeIp(ip);

  if (normalized === '::1') return true;

  const lower = normalized.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80:')) return true;

  if (normalized.startsWith('127.')) return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  if (normalized.startsWith('172.')) {
    const parts = normalized.split('.');
    const second = Number(parts[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

function extractBearerToken(authHeader: unknown): string | undefined {
  if (typeof authHeader !== 'string') return undefined;
  const [scheme, token] = authHeader.trim().split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

@Injectable()
export class MetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const expectedToken = (process.env.METRICS_TOKEN ?? '').trim();
    if (expectedToken) {
      const authToken = extractBearerToken(req?.headers?.authorization);
      const headerToken = req?.headers?.['x-metrics-token'];
      const provided = authToken ?? (typeof headerToken === 'string' ? headerToken : undefined);
      if (provided === expectedToken) {
        return true;
      }
      throw new ForbiddenException('metrics forbidden');
    }

    if (process.env.NODE_ENV === 'production') {
      const ip = normalizeIp(req?.ip);
      if (isPrivateIp(ip)) {
        return true;
      }
      throw new ForbiddenException('metrics forbidden');
    }

    return true;
  }
}

