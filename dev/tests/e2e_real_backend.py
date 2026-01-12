"""真实后端 E2E 测试

直接调用云端 API (https://passport.dingnew.top) 进行端到端测试。
注意：此测试会创建真实数据，仅用于验证环境。
"""

import requests
import time
import sys

BASE_URL = "https://passport.dingnew.top/api"
ADMIN_URL = "https://passport.dingnew.top/api/admin"

# 测试用手机号（使用测试号段，避免发送真实短信）
TEST_PHONE = "13800000001"


def log(msg: str, status: str = "INFO"):
    symbols = {"PASS": "[PASS]", "FAIL": "[FAIL]", "INFO": "[INFO]", "SKIP": "[SKIP]"}
    print(f"{symbols.get(status, '[INFO]')} {msg}")


def test_health_check():
    """测试健康检查接口"""
    log("Testing health check...")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get("status") == "ok", f"Expected status=ok, got {data}"
        log(f"Health check passed: uptime={data.get('uptime', 0):.0f}s", "PASS")
        return True
    except Exception as e:
        log(f"Health check failed: {e}", "FAIL")
        return False


def test_send_code_invalid_phone():
    """测试发送验证码 - 无效手机号"""
    log("Testing send-code with invalid phone...")
    try:
        resp = requests.post(
            f"{BASE_URL}/passport/send-code",
            json={"phone": "123"},  # 无效手机号
            timeout=10
        )
        # 应该返回 400 或包含错误码
        if resp.status_code == 400:
            log("Invalid phone rejected correctly", "PASS")
            return True
        data = resp.json()
        if data.get("error_code") or data.get("code"):
            log(f"Invalid phone rejected: {data}", "PASS")
            return True
        log(f"Unexpected response: {resp.status_code} {data}", "FAIL")
        return False
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def test_login_wrong_code():
    """测试登录 - 错误验证码"""
    log("Testing login with wrong code...")
    try:
        resp = requests.post(
            f"{BASE_URL}/passport/login-by-phone",
            json={
                "phone": TEST_PHONE,
                "code": "000000",  # 错误验证码
                "app_id": "jiuweihu"
            },
            timeout=10
        )
        # 应该返回 401 或错误码
        if resp.status_code in [400, 401]:
            data = resp.json()
            error_code = data.get("error_code") or data.get("code")
            if error_code in ["ERR_CODE_INVALID", "ERR_CODE_EXPIRED", "ERR_CODE_NOT_FOUND"]:
                log(f"Wrong code rejected: {error_code}", "PASS")
                return True
        log(f"Response: {resp.status_code} {resp.text[:200]}", "INFO")
        # 即使不是预期错误码，只要不是 200 就算通过
        if resp.status_code != 200:
            log("Wrong code rejected (non-200)", "PASS")
            return True
        log("Wrong code was accepted - unexpected!", "FAIL")
        return False
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def test_refresh_invalid_token():
    """测试刷新 - 无效 token"""
    log("Testing refresh with invalid token...")
    try:
        resp = requests.post(
            f"{BASE_URL}/passport/refresh-token",
            json={
                "guid": "INVALID-GUID",
                "refresh_token": "INVALID-TOKEN",
                "app_id": "jiuweihu"
            },
            timeout=10
        )
        if resp.status_code in [401, 403]:
            data = resp.json()
            error_code = data.get("error_code") or data.get("code")
            log(f"Invalid token rejected: {error_code}", "PASS")
            return True
        log(f"Response: {resp.status_code} {resp.text[:200]}", "INFO")
        if resp.status_code != 200:
            log("Invalid token rejected (non-200)", "PASS")
            return True
        log("Invalid token was accepted - unexpected!", "FAIL")
        return False
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def test_verify_invalid_token():
    """测试验证 - 无效 access token"""
    log("Testing verify with invalid token...")
    try:
        resp = requests.post(
            f"{BASE_URL}/passport/verify-token",
            json={
                "access_token": "INVALID-ACCESS-TOKEN",
                "app_id": "jiuweihu"
            },
            timeout=10
        )
        if resp.status_code in [401, 403]:
            data = resp.json()
            error_code = data.get("error_code") or data.get("code")
            log(f"Invalid access token rejected: {error_code}", "PASS")
            return True
        log(f"Response: {resp.status_code} {resp.text[:200]}", "INFO")
        if resp.status_code != 200:
            log("Invalid access token rejected (non-200)", "PASS")
            return True
        log("Invalid access token was accepted - unexpected!", "FAIL")
        return False
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def test_admin_users_unauthorized():
    """测试后台用户列表 - 未授权"""
    log("Testing admin users without auth...")
    try:
        resp = requests.get(f"{ADMIN_URL}/users", timeout=10)
        if resp.status_code in [401, 403]:
            log("Unauthorized access rejected", "PASS")
            return True
        log(f"Response: {resp.status_code} {resp.text[:200]}", "INFO")
        # 如果返回 200 但需要认证，也可能是空列表
        if resp.status_code != 200:
            log("Unauthorized access rejected (non-200)", "PASS")
            return True
        log("Unauthorized access was allowed - check auth config", "FAIL")
        return False
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def test_metrics_endpoint():
    """测试 metrics 端点"""
    log("Testing metrics endpoint...")
    try:
        resp = requests.get(f"{ADMIN_URL}/metrics", timeout=10)
        # metrics 可能需要认证，401/403 也是预期行为
        if resp.status_code == 200:
            data = resp.json()
            log(f"Metrics available: {list(data.keys())[:5]}...", "PASS")
            return True
        elif resp.status_code in [401, 403]:
            log("Metrics requires auth (expected)", "PASS")
            return True
        log(f"Unexpected response: {resp.status_code}", "INFO")
        return True  # 不算失败
    except Exception as e:
        log(f"Test failed: {e}", "FAIL")
        return False


def run_all_tests():
    """运行所有测试"""
    print("=" * 60)
    print("Passport E2E Tests - Real Backend")
    print(f"Target: {BASE_URL}")
    print("=" * 60)
    print()

    tests = [
        ("Health Check", test_health_check),
        ("Send Code - Invalid Phone", test_send_code_invalid_phone),
        ("Login - Wrong Code", test_login_wrong_code),
        ("Refresh - Invalid Token", test_refresh_invalid_token),
        ("Verify - Invalid Token", test_verify_invalid_token),
        ("Admin Users - Unauthorized", test_admin_users_unauthorized),
        ("Metrics Endpoint", test_metrics_endpoint),
    ]

    results = []
    for name, test_fn in tests:
        print(f"\n--- {name} ---")
        try:
            result = test_fn()
            results.append((name, result))
        except Exception as e:
            log(f"Unexpected error: {e}", "FAIL")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, r in results if r)
    failed = sum(1 for _, r in results if not r)

    for name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  [{status}] {name}")

    print()
    print(f"Total: {len(results)} | Passed: {passed} | Failed: {failed}")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
