// 通用请求封装，对应 Cycle8：统一处理 Token 相关错误码。

async function apiRequest(path, options = {}) {
  const resp = await fetch(path, options);
  const data = await resp.json().catch(() => ({}));

  if (resp.ok) {
    return data;
  }

  const code = data.error_code;
  if (code === "ERR_ACCESS_EXPIRED" || code === "ERR_ACCESS_INVALID") {
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.location.href = "/login";
    throw new Error(code);
  }
  if (code === "ERR_APP_ID_MISMATCH") {
    alert("当前应用无权限访问该资源");
    throw new Error(code);
  }

  throw new Error(code || "REQUEST_FAILED");
}
