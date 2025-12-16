import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('user can login with phone and code (backend stubbed)', async ({ page }) => {
    await page.route('**/api/passport/send-code', async (route, request) => {
      const body = request.postDataJSON?.() as { phone?: string } | undefined;
      expect(body?.phone).toBe('13800138000');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route('**/api/passport/login-by-phone', async (route, request) => {
      const body = request.postDataJSON?.() as { phone?: string; code?: string; app_id?: string } | undefined;
      expect(body?.phone).toBe('13800138000');
      expect(body?.code).toBe('123456');
      expect(body?.app_id).toBe('jiuweihu');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          guid: 'G-E2E-1',
          access_token: 'A.E2E.token',
          refresh_token: 'R.E2E.token',
          account_source: 'passport',
          user_type: 'user',
          roles: [],
        }),
      });
    });

    await page.goto('/login');

    await page.getByLabel('手机号：').fill('13800138000');
    await page.getByRole('button', { name: '获取验证码' }).click();
    await expect(page.getByText('验证码已发送')).toBeVisible();

    await page.getByLabel('验证码：').fill('123456');
    await page.getByRole('checkbox', { name: '已阅读并同意用户协议' }).check();

    await Promise.all([
      page.waitForURL('**/'),
      page.getByRole('button', { name: '登录' }).click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    const guid = await page.evaluate(() => window.localStorage.getItem('guid'));
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'));
    const userType = await page.evaluate(() => window.localStorage.getItem('user_type'));

    expect(guid).toBe('G-E2E-1');
    expect(accessToken).toBe('A.E2E.token');
    expect(userType).toBe('user');
  });

  test('banned user sees proper error message and stays on login page', async ({ page }) => {
    await page.route('**/api/passport/send-code', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route('**/api/passport/login-by-phone', async (route, request) => {
      const body = request.postDataJSON?.() as { phone?: string; code?: string; app_id?: string } | undefined;
      expect(body?.phone).toBe('13800138000');
      expect(body?.code).toBe('123456');
      expect(body?.app_id).toBe('jiuweihu');

      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'ERR_USER_BANNED', message: 'user banned' }),
      });
    });

    await page.goto('/login');

    await page.getByLabel('手机号：').fill('13800138000');
    await page.getByRole('button', { name: '获取验证码' }).click();
    await expect(page.getByText('验证码已发送')).toBeVisible();

    await page.getByLabel('验证码：').fill('123456');
    await page.getByRole('checkbox', { name: '已阅读并同意用户协议' }).check();

    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.getByText('账号已被封禁，请联系客服')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    const guid = await page.evaluate(() => window.localStorage.getItem('guid'));
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'));
    const userType = await page.evaluate(() => window.localStorage.getItem('user_type'));

    expect(guid).toBeNull();
    expect(accessToken).toBeNull();
    expect(userType).toBeNull();
  });
});
