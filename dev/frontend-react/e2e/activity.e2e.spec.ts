import { test, expect } from '@playwright/test';

test.describe('User activity page', () => {
  test('loads activities and supports filtering and export', async ({ page }) => {
    type ActivityRow = {
      guid: string;
      phone: string;
      login_at: string;
      logout_at?: string | null;
      channel?: string | null;
      ip?: string | null;
    };

    const allRows: ActivityRow[] = [
      {
        guid: 'G-ACT-1',
        phone: '13800138000',
        login_at: '2025-01-01T10:00:00.000Z',
        logout_at: null,
        channel: 'pc',
        ip: '1.1.1.1',
      },
      {
        guid: 'G-ACT-2',
        phone: '13900139000',
        login_at: '2025-01-01T11:00:00.000Z',
        logout_at: '2025-01-01T12:00:00.000Z',
        channel: 'mobile',
        ip: '2.2.2.2',
      },
    ];

    await page.route('**/api/admin/activity**', async (route, request) => {
      const url = new URL(request.url());
      const phone = url.searchParams.get('phone');
      const channel = url.searchParams.get('channel');

      let activities = allRows;
      if (phone) activities = activities.filter((r) => r.phone === phone);
      if (channel) activities = activities.filter((r) => r.channel === channel);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activities }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('guid', 'G-ACT-ADMIN');
      window.localStorage.setItem('access_token', 'A.ACT.token');
      window.localStorage.setItem('refresh_token', 'R.ACT.token');
      window.localStorage.setItem('account_source', 'admin');
      window.localStorage.setItem('user_type', 'admin');
      window.localStorage.setItem('admin_roles', JSON.stringify(['OPERATOR']));
    });

    await page.goto('/admin/activity');

    await expect(page.getByRole('heading', { name: '用户活跃明细' })).toBeVisible();
    await expect(page.getByText('13800138000')).toBeVisible();
    await expect(page.getByText('13900139000')).toBeVisible();

    const phoneInput = page.getByRole('textbox').nth(0);
    const channelInput = page.getByRole('textbox').nth(1);

    await phoneInput.fill('13800138000');
    await channelInput.fill('pc');

    await page.getByRole('button', { name: '查询' }).click();

    await expect(page.getByText('13800138000')).toBeVisible();
    await expect(page.getByText('13900139000')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出当前结果' }).click(),
    ]);

    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/user-activity-.*\.csv/);
  });
});
