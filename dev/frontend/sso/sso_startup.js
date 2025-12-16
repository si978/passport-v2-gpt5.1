// SSO 启动处理，对应 Cycle11：根据壳层传入的 session.status 触发自动登录。

import { apiRequest } from "../request.js"; // 实际项目中根据打包工具调整导入路径

export async function handleSessionStatus(status) {
  if (status === "sso_available") {
    const refreshToken = window.localStorage.getItem("refresh_token");
    if (!refreshToken) {
      // 无 refresh_token 时无法自动登录，回退到登录页
      window.location.href = "/login";
      return;
    }
    try {
      const data = await apiRequest("/api/passport/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken, app_id: "youlishe" }),
      });
      window.localStorage.setItem("access_token", data.access_token);
      // 刷新成功后跳转到主页
      window.location.href = "/";
    } catch (_e) {
      // 失败时交由 apiRequest 的错误处理逻辑+本处回退
      window.location.href = "/login";
    }
  } else {
    // none 等其它状态：保持登录页
  }
}
