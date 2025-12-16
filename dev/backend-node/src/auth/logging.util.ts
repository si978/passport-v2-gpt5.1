export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  // 13800138000 -> 138****8000
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

export function maskToken(token?: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) {
    return '****';
  }
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-4);
  return `${prefix}****${suffix}`;
}

export function maskCode(code?: string | null): string {
  if (!code) return '******';
  return '******';
}
