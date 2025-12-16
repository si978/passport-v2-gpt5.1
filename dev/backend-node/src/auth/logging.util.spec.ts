import { maskPhone, maskToken, maskCode } from './logging.util';

describe('logging util masking', () => {
  it('masks phone numbers to 138****8000 format', () => {
    expect(maskPhone('13800138000')).toBe('138****8000');
    expect(maskPhone(null)).toBeNull();
  });

  it('masks tokens by keeping first/last 4 chars', () => {
    expect(maskToken('ABCDEFGH12345678')).toBe('ABCD****5678');
    expect(maskToken('short')).toBe('****');
    expect(maskToken(null)).toBeNull();
  });

  it('always returns ****** for codes', () => {
    expect(maskCode('123456')).toBe('******');
    expect(maskCode('')).toBe('******');
    expect(maskCode()).toBe('******');
  });
});
