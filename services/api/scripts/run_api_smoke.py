"""
启动本机 Uvicorn（独立临时 SQLite），创建 AI Token 后用 HTTP 冒烟测试全部公开接口。

在 **services/api** 目录执行：

  python -m scripts.run_api_smoke

可选环境变量：
  SMOKE_PORT   默认 18991
  SMOKE_HOST   默认 127.0.0.1
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _wait_health(base: str, timeout_s: float = 60.0) -> None:
    deadline = time.time() + timeout_s
    last_err: str | None = None
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base}/health", timeout=2.0)
            if r.status_code == 200 and r.json().get("status") == "ok":
                return
            last_err = f"status={r.status_code} body={r.text[:200]}"
        except Exception as e:  # noqa: BLE001
            last_err = repr(e)
        time.sleep(0.25)
    raise RuntimeError(f"服务未在 {timeout_s}s 内就绪: {last_err}")


def _run_smoke(base: str, token: str) -> None:
    h = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=base, timeout=15.0) as c:
        r = c.get("/health")
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok"}

        r = c.get("/docs")
        assert r.status_code == 200, r.text

        r = c.get("/openapi.json")
        assert r.status_code == 200, r.text
        paths = r.json().get("paths", {})
        assert "/health" in paths
        assert "/api/v1/ai/schedules" in paths
        assert "/api/v1/ai/files/upload" in paths
        assert "/api/v1/ai/files/presign" in paths

        r = c.get("/api/v1/ai/schedules")
        assert r.status_code == 401

        r = c.get("/api/v1/ai/schedules", headers={"Authorization": "Bearer invalid"})
        assert r.status_code == 401

        body = {
            "title": "冒烟日程",
            "description": "run_api_smoke",
            "start_at": "2026-04-11T16:00:00+00:00",
            "timezone": "UTC",
        }
        r = c.post("/api/v1/ai/schedules", json=body, headers=h)
        assert r.status_code == 201, r.text
        row = r.json()
        assert row["title"] == "冒烟日程"
        sid = row["id"]

        r = c.get(f"/api/v1/ai/schedules/{sid}", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == sid

        r = c.patch(f"/api/v1/ai/schedules/{sid}", json={"title": "已更新"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "已更新"

        r = c.get("/api/v1/ai/schedules", headers=h)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1

        r = c.delete(f"/api/v1/ai/schedules/{sid}", headers=h)
        assert r.status_code == 204, r.text

        r = c.get("/api/v1/ai/schedules", headers=h)
        assert r.status_code == 200, r.text
        assert r.json() == []

        r = c.get(f"/api/v1/ai/schedules/{uuid4()}", headers=h)
        assert r.status_code == 404


def main() -> int:
    parser = argparse.ArgumentParser(description="启动 Uvicorn 并对 API 做 HTTP 冒烟测试")
    parser.add_argument("--host", default=os.environ.get("SMOKE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SMOKE_PORT", "18991")))
    args = parser.parse_args()

    root = _repo_root()
    db = tempfile.NamedTemporaryFile(prefix="tasktick_smoke_", suffix=".db", delete=False)
    db.close()
    db_path = Path(db.name)
    db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"

    env = os.environ.copy()
    env["DATABASE_URL"] = db_url

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(root),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    base = f"http://{args.host}:{args.port}"
    try:
        _wait_health(base)
        time.sleep(0.35)

        os.environ["DATABASE_URL"] = db_url
        from app.config import get_settings  # noqa: E402

        get_settings.cache_clear()

        from scripts.create_ai_token import run as create_token  # noqa: E402

        token = asyncio.run(create_token("smoke-api@local", "run_api_smoke"))
        _run_smoke(base, token)
        print("run_api_smoke: OK (all HTTP checks passed)")
        return 0
    except AssertionError as e:
        print(f"run_api_smoke: assertion failed: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"run_api_smoke: error: {e}", file=sys.stderr)
        return 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
        try:
            if db_path.exists():
                db_path.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
