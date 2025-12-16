import { GuidGenerator } from './guid-generator';

describe('GuidGenerator', () => {
  const realRandom = Math.random;

  afterEach(() => {
    // 恢复随机数生成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Math as any).random = realRandom;
  });

  it('generates 20-char guid with date + type + random digits', () => {
    // 固定随机数，使结果可预测
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Math as any).random = () => 0.1; // Math.floor(0.1 * 10) = 1

    const gen = new GuidGenerator();
    const now = new Date('2025-01-02T03:04:05Z');
    const guid = gen.generate(5, now);

    expect(guid).toHaveLength(20);
    expect(guid.slice(0, 8)).toBe('20250102');
    expect(guid.slice(8, 10)).toBe('05');
    const randPart = guid.slice(10);
    expect(randPart).toMatch(/^[0-9]{10}$/);
    expect(randPart).toBe('1111111111');
  });
});
