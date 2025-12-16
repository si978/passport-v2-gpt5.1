// 退出登录脚本，对应 Cycle16：统一调用后端退出接口并清理本地状态。

async function logout() {
  try {
    // 占位接口，实际项目中由后端提供 /api/passport/logout
    await fetch("/api/passport/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (_e) {
    // 忽略网络错误，按幂等退出处理
  } finally {
    window.localStorage.removeItem("passport_guid");
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.location.href = "/login";
  }
}

const btn = document.getElementById("logout-btn");
if (btn) {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    logout();
  });
}
