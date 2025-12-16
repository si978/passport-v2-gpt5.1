from __future__ import annotations

import os
import sys


if not getattr(sys, "frozen", False):
    here = os.path.abspath(os.path.dirname(__file__))
    dev_root = os.path.abspath(os.path.join(here, ".."))
    if dev_root not in sys.path:
        sys.path.insert(0, dev_root)

from shell.passport_client_gui_lib import run_client


def main() -> int:
    # 双向 SSO：本端也可手机号登录写入 session.dat，供另一端自动登录。
    return run_client(app_id="youlishe", title="Passport 客户端 - youlishe", allow_phone_login=True)


if __name__ == "__main__":
    raise SystemExit(main())
