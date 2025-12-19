describe('user-role.util', () => {
  beforeEach(() => {
    delete process.env.ADMIN_USER_TYPES;
    delete process.env.ADMIN_ROLE_MAP;
    jest.resetModules();
  });

  it('treats userType as admin when in ADMIN_USER_TYPES', async () => {
    process.env.ADMIN_USER_TYPES = '9';
    const util = await import('./user-role.util');
    expect(util.isAdminUserType(9)).toBe(true);
    expect(util.resolveUserTypeLabel(9)).toBe('admin');
    expect(util.resolveAdminRoles(9)).toEqual(['OPERATOR']);
  });

  it('supports mapping roles by userType via ADMIN_ROLE_MAP', async () => {
    process.env.ADMIN_ROLE_MAP = '9=OPERATOR,8=SUPPORT,7=TECH';
    const util = await import('./user-role.util');
    expect(util.isAdminUserType(8)).toBe(true);
    expect(util.resolveUserTypeLabel(8)).toBe('admin');
    expect(util.resolveAdminRoles(8)).toEqual(['SUPPORT']);
  });

  it('falls back to OPERATOR when admin but no mapped roles exist', async () => {
    process.env.ADMIN_ROLE_MAP = '8=SUPPORT';
    process.env.ADMIN_USER_TYPES = '9';
    const util = await import('./user-role.util');
    expect(util.isAdminUserType(9)).toBe(true);
    expect(util.resolveAdminRoles(9)).toEqual(['OPERATOR']);
  });
});

