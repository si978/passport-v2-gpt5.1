import { test, expect } from '@playwright/test';

test.describe('Admin pages', () => {
  test('user list loads and allows ban / unban actions', async ({ page }) => {
    type UserVm = { guid: string; phone: string; status: 'ACTIVE' | 'BANNED' | 'DELETED'; account_source: string };

    const initialUsers: UserVm[] = [
      { guid: 'G-A1', phone: '13800138000', status: 'ACTIVE', account_source: 'phone' },
      { guid: 'G-A2', phone: '13900139000', status: 'BANNED', account_source: 'phone' },
    ];
    let currentUsers: UserVm[] = [...initialUsers];

    await page.route('**/api/admin/**', async (route, request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;
      const method = request.method();

      if (method === 'GET' && pathname === '/api/admin/users') {
        const status = url.searchParams.get('status');
        let users = currentUsers;
        if (status) {
          users = users.filter((u) => u.status === status);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ users }),
        });
        return;
      }

      if (method === 'POST') {
        const match = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(ban|unban)$/);
        if (match) {
          const [, guid, action] = match;
          currentUsers = currentUsers.map((u) => {
            if (u.guid !== guid) return u;
            if (action === 'ban') return { ...u, status: 'BANNED' };
            if (action === 'unban') return { ...u, status: 'ACTIVE' };
            return u;
          });
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
          return;
        }
      }

      await route.fallback();
    });

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('guid', 'G-ADMIN-LIST');
      window.localStorage.setItem('access_token', 'A.ADMIN.list');
      window.localStorage.setItem('refresh_token', 'R.ADMIN.list');
      window.localStorage.setItem('account_source', 'admin');
      window.localStorage.setItem('user_type', 'admin');
      window.localStorage.setItem('admin_roles', JSON.stringify(['OPERATOR']));
    });

    await page.goto('/admin/users');

    await expect(page.getByRole('heading', { name: '后台用户列表' })).toBeVisible();
    await expect(page.getByText('13800138000')).toBeVisible();
    await expect(page.getByText('13900139000')).toBeVisible();

    const rowForG1 = page.getByRole('row', { name: /13800138000/ });

    await rowForG1.getByRole('button', { name: '封禁' }).click();

    const unbanButton = rowForG1.getByRole('button', { name: '解封' });
    await expect(unbanButton).toBeVisible();

    await unbanButton.click();

    await expect(rowForG1.getByRole('button', { name: '封禁' })).toBeVisible();
  });

  test('expired token on admin API forces redirect to login', async ({ page }) => {
    await page.route('**/api/admin/users**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'ERR_ACCESS_EXPIRED', message: 'expired' }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('guid', 'G-ADMIN-1');
      window.localStorage.setItem('access_token', 'A.ADMIN.token');
      window.localStorage.setItem('refresh_token', 'R.ADMIN.token');
      window.localStorage.setItem('account_source', 'admin');
      window.localStorage.setItem('user_type', 'admin');
      window.localStorage.setItem('admin_roles', JSON.stringify(['OPERATOR']));
    });

    await page.goto('/admin/users');

    await expect(page.getByRole('heading', { name: '手机号登录 / 注册' })).toBeVisible();

    const guid = await page.evaluate(() => window.localStorage.getItem('guid'));
    const accessToken = await page.evaluate(() => window.localStorage.getItem('access_token'));
    const refreshToken = await page.evaluate(() => window.localStorage.getItem('refresh_token'));
    const userType = await page.evaluate(() => window.localStorage.getItem('user_type'));
    const adminRoles = await page.evaluate(() => window.localStorage.getItem('admin_roles'));

    expect(guid).toBeNull();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
    expect(userType).toBeNull();
    expect(adminRoles).toBeNull();
  });
});
