"""Local operator commands. Account provisioning is never exposed over HTTP."""

import argparse
import getpass
import sqlite3
from pathlib import Path

from .auth import hash_password
from .db import connect, migrate, transaction


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user")
    create.add_argument("username")
    create.add_argument("--owner", action="store_true")
    create.add_argument("--admin", action="store_true")
    back = commands.add_parser("backup")
    back.add_argument("destination", type=Path)
    args = parser.parse_args()
    migrate()
    if args.command == "backup":
        with args.destination.open("xb"):
            pass
        args.destination.chmod(0o600)
        src, dst = connect(), sqlite3.connect(args.destination)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        return
    if not args.owner and not args.admin or not 1 <= len(args.username.strip()) <= 80:
        parser.error("Supply a username and at least one role")
    first = getpass.getpass("Пароль: ")
    if first != getpass.getpass("Повтори пароль: "):
        parser.error("Пароли различаются")
    with transaction(True) as db:
        db.execute(
            "INSERT INTO users(username,password,owner,admin) VALUES(?,?,?,?)",
            (args.username.strip(), hash_password(first), args.owner, args.admin),
        )


if __name__ == "__main__":
    main()
