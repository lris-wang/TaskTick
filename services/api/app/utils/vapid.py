"""
VAPID key management for Web Push notifications.

Production: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_APPLICATION_SERVER_KEY env vars.
Development: keys are auto-generated once and stored in ~/.tasktick/vapid_keys.json
             (outside the project directory — never committed to git).

VAPID_SUBJECT should be a mailto: or https: URL identifying your server.
"""

import json
import os
from pathlib import Path

_VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
_VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
_VAPID_APPLICATION_SERVER_KEY = os.getenv("VAPID_APPLICATION_SERVER_KEY")

# Store in user home dir, NOT inside the project directory
_KEYS_DIR = Path.home() / ".tasktick"
_KEYS_FILE = _KEYS_DIR / "vapid_keys.json"


def _load_or_generate_keys() -> tuple[str, str, str]:
    if _VAPID_PUBLIC_KEY and _VAPID_PRIVATE_KEY:
        app_key = _VAPID_APPLICATION_SERVER_KEY
        if not app_key:
            from webpush import VAPID
            app_key = VAPID.get_application_server_key(_VAPID_PUBLIC_KEY)
        return _VAPID_PUBLIC_KEY, _VAPID_PRIVATE_KEY, app_key

    if _KEYS_FILE.exists():
        try:
            keys = json.loads(_KEYS_FILE.read_text())
            return keys["public"], keys["private"], keys["application_server_key"]
        except Exception:
            pass

    from webpush import VAPID
    private_pem, public_pem, application_server_key = VAPID.generate_keys()
    _KEYS_DIR.mkdir(parents=True, exist_ok=True)
    _KEYS_FILE.write_text(
        json.dumps(
            {
                "private": private_pem.decode(),
                "public": public_pem.decode(),
                "application_server_key": application_server_key,
            }
        )
    )
    return public_pem.decode(), private_pem.decode(), application_server_key


VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_APPLICATION_SERVER_KEY = _load_or_generate_keys()
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:notify@tasktick.local")
