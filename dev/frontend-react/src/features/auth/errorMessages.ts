const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  ERR_CODE_INVALID: '验证码错误，请重新输入',
  ERR_CODE_EXPIRED: '验证码已过期，请重新获取',
  ERR_CODE_TOO_FREQUENT: '验证码发送过于频繁，请稍后重试',
  ERR_PHONE_INVALID: '手机号格式不正确',
  ERR_USER_BANNED: '账号已被封禁，请联系客服',
  ERR_USER_DELETED: '账号已注销，需重新注册',
  ERR_SESSION_NOT_FOUND: '当前会话已失效，请重新登录',
  ERR_ACCESS_INVALID: '会话校验失败，请重新登录',
  ERR_ACCESS_EXPIRED: '登录会话已过期，请重新登录',
  ERR_REFRESH_EXPIRED: '登录状态已过期，请重新登录',
  ERR_REFRESH_MISMATCH: '检测到异常登录，请重新验证身份',
  ERR_APP_ID_MISMATCH: '当前应用无权访问该账号',
};

export const getLoginErrorMessage = (code?: string): string | undefined =>
  (code ? LOGIN_ERROR_MESSAGES[code] : undefined);

export const getSendCodeErrorMessage = (code?: string): string | undefined => {
  if (!code) return undefined;
  if (code === 'ERR_CODE_TOO_FREQUENT') {
    return LOGIN_ERROR_MESSAGES.ERR_CODE_TOO_FREQUENT;
  }
  if (code === 'ERR_PHONE_INVALID') {
    return LOGIN_ERROR_MESSAGES.ERR_PHONE_INVALID;
  }
  return undefined;
};
