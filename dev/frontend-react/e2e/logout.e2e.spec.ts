import { test, expect } from '@playwright/test';

test.describe('Logout flow', () => {
  test('clicking logout calls API, clears storage and redirects to login', async ({ page }) => {
    await page.route('**/api/passport/logout', async (route, request) => {
      const body = request.postDataJSON?.() as { access_token?: string } | undefined;
      const headers = request.headers();

      expect(body?.access_token).toBe('A.E2E.token');
      expect(headers.authorization ?? headers.Authorization).toBe('Bearer A.E2E.token');

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto('/');

    await page.evaluate(() => {
      window.localStorage.setItem('guid', 'G-E2E-LOGOUT');
      window.localStorage.setItem('access_token', 'A.E2E.token');
      window.localStorage.setItem('refresh_token', 'R.E2E.token');
    });

    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    await Promise.all([
      page.waitForURL('**/login'),
      page.getByRole('button', { name: '退出登录' }).click(),
    ]);

    const guid = await page.evaluate(() => window.localStorage.getItem('guid'));
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'));
    const refreshToken = await page.evaluate(() => window.localStorage.getItem('refresh_token'));

    expect(guid).toBeNull();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });
});
