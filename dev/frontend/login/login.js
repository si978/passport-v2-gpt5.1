// 简单前端脚本，对应 Cycle1 / Cycle4 的基础交互逻辑。

const phoneInput = document.getElementById("phone");
const codeInput = document.getElementById("code");
const sendCodeBtn = document.getElementById("send-code");
const agreeCheckbox = document.getElementById("agree");
const loginForm = document.getElementById("login-form");
const messageBox = document.getElementById("message");

let sendCooldown = 0;
let cooldownTimer = null;

function showMessage(text) {
  messageBox.textContent = text;
}

function isValidPhone(phone) {
  return /^1[3-9][0-9]{9}$/.test(phone);
}

async function sendCode() {
  const phone = phoneInput.value.trim();
  if (!isValidPhone(phone)) {
    showMessage("手机号格式不正确");
    return;
  }
  if (sendCooldown > 0) return;

  try {
    // TODO: 将 URL 替换为实际后端地址
    const resp = await fetch("/api/passport/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showMessage(data.error_code || "发送验证码失败");
      return;
    }
    showMessage("验证码已发送");
    startCooldown(60);
  } catch (e) {
    showMessage("网络错误，请稍后重试");
  }
}

function startCooldown(seconds) {
  sendCooldown = seconds;
  updateSendButton();
  cooldownTimer = setInterval(() => {
    sendCooldown -= 1;
    if (sendCooldown <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      sendCooldown = 0;
    }
    updateSendButton();
  }, 1000);
}

function updateSendButton() {
  if (sendCooldown > 0) {
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = `重新发送(${sendCooldown}s)`;
  } else {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = "获取验证码";
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const phone = phoneInput.value.trim();
  const code = codeInput.value.trim();

  if (!isValidPhone(phone)) {
    showMessage("手机号格式不正确");
    return;
  }
  if (!/^[0-9]{6}$/.test(code)) {
    showMessage("请输入 6 位数字验证码");
    return;
  }
  if (!agreeCheckbox.checked) {
    showMessage("请先勾选同意用户协议");
    return;
  }

  try {
    const resp = await fetch("/api/passport/login-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, app_id: "jiuweihu" }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showMessage(data.error_code || "登录失败");
      return;
    }
    // 简单记录登录态，访问令牌仅存于 sessionStorage，降低持久化风险
    window.localStorage.setItem("passport_guid", data.guid);
    window.sessionStorage.setItem("access_token", data.access_token);
    showMessage("登录成功");
    // TODO: 跳转到应用主页
  } catch (e) {
    showMessage("网络错误，请稍后重试");
  }
}

sendCodeBtn.addEventListener("click", sendCode);
loginForm.addEventListener("submit", onSubmit);
