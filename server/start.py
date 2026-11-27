"""Set ownership of the mounted data directory, then drop privileges before serving HTTP."""

import os
import pwd
from pathlib import Path


def main():
    account = pwd.getpwnam("requiem")
    directory = Path(os.environ["REQUIEM_DB"]).parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.geteuid() == 0:
        os.chown(directory, account.pw_uid, account.pw_gid)
        os.chmod(directory, 0o700)
        os.setgroups([])
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)
    os.umask(0o077)
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "server.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            os.getenv("PORT", "8080"),
            "--no-proxy-headers",
        ],
    )


if __name__ == "__main__":
    main()
