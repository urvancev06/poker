"""Clear all logged hands — resets My-stats, leaks, and the hand-history browser.

Deletes every row from the ``hands`` table of whatever database POKER_DB_URL
points at (default: ``poker.db`` in the current directory). Sessions live in
memory, so nothing else is persisted — this is a full clean slate.

Dry-run (just shows the count):
    .venv/bin/python scripts/clear_history.py

Actually delete (where the friend played — usually the server's DB):
    POKER_DB_URL=sqlite:////var/lib/poker/poker.db .venv/bin/python scripts/clear_history.py --yes
"""

from __future__ import annotations

import sys

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from poker.db import make_engine
from poker.db.database import DEFAULT_URL
from poker.db.models import HandRecord


def main() -> None:
    engine = make_engine()
    with Session(engine) as session:
        count = session.scalar(select(func.count()).select_from(HandRecord)) or 0
        print(f"database : {DEFAULT_URL}")
        print(f"hands logged : {count}")
        if "--yes" not in sys.argv:
            print("\ndry run — re-run with --yes to delete all of these hands.")
            return
        session.execute(delete(HandRecord))
        session.commit()
        print(f"\ndeleted {count} hands — clean slate.")


if __name__ == "__main__":
    main()
