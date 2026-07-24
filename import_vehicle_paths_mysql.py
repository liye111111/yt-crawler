#!/usr/bin/env python3
"""Flatten SQLite nodes into MySQL year/make/model/trim/engine rows."""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
from pathlib import Path

from import_mysql import DEFAULT_DB_URL, parse_jdbc_url

LEVEL_NAMES = ("year", "make", "model", "trim", "engine")


def load_vehicle_paths(sqlite_path: Path) -> list[tuple[object, ...]]:
    if not sqlite_path.is_file():
        raise SystemExit(f"SQLite database not found: {sqlite_path}")
    db = sqlite3.connect(sqlite_path)
    db.row_factory = sqlite3.Row
    table = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='nodes'"
    ).fetchone()
    if table is None:
        db.close()
        raise RuntimeError("SQLite database has no 'nodes' table; run crawler.py first")

    records = db.execute(
        "SELECT id, attribute_id, parent_id, is_leaf, value FROM nodes"
    ).fetchall()
    db.close()
    nodes = {str(record["id"]): record for record in records}
    paths: set[tuple[object, ...]] = set()
    for record in records:
        if not record["is_leaf"] and record["attribute_id"] < 5:
            continue
        values: list[str | None] = [None] * 5
        current = record
        seen: set[str] = set()
        while current is not None and str(current["id"]) not in seen:
            seen.add(str(current["id"]))
            attribute_id = int(current["attribute_id"])
            if 1 <= attribute_id <= 5:
                values[attribute_id - 1] = str(current["value"])
            current = nodes.get(str(current["parent_id"]))
        if values[0] is None:
            logging.warning("skipping leaf %s: its year ancestor is missing", record["id"])
            continue
        paths.add((int(values[0]), *values[1:]))
    return sorted(paths, key=lambda row: tuple("" if value is None else str(value) for value in row))


def import_paths(args: argparse.Namespace) -> None:
    try:
        import mysql.connector
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency. Install it with: python3 -m pip install -r requirements.txt"
        ) from exc

    password = args.password or os.environ.get("MYSQL_PASSWORD")
    if not password:
        raise SystemExit("Set MYSQL_PASSWORD or pass --password")
    paths = load_vehicle_paths(args.sqlite)
    config = parse_jdbc_url(args.db_url)
    logging.info("rebuilt %d distinct vehicle path(s) from SQLite", len(paths))
    mysql_db = mysql.connector.connect(
        **config,
        user=args.username,
        password=password,
        connection_timeout=args.timeout,
        autocommit=False,
    )
    cursor = mysql_db.cursor()
    quoted_table = f"`{args.table}`"
    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema=%s AND table_name=%s",
        (config["database"], args.table),
    )
    if cursor.fetchone()[0] == 0:
        cursor.close()
        mysql_db.close()
        raise RuntimeError(f"target table does not exist: {config['database']}.{args.table}")

    cursor.execute(f"SELECT `year`, make, model, trim, engine FROM {quoted_table}")
    existing = {tuple(row) for row in cursor.fetchall()}
    pending = [row for row in paths if row not in existing]
    logging.info("%d path(s) already exist; %d new path(s) to insert", len(existing), len(pending))
    insert_sql = (
        f"INSERT INTO {quoted_table} (`year`, make, model, trim, engine) "
        "VALUES (%s, %s, %s, %s, %s)"
    )
    imported = 0
    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset : offset + args.batch_size]
        cursor.executemany(insert_sql, batch)
        mysql_db.commit()
        imported += len(batch)
        logging.info("inserted %d/%d new path(s)", imported, len(pending))
    cursor.close()
    mysql_db.close()
    logging.info("done: %d new vehicle row(s) inserted", imported)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=Path("data/vehicles.sqlite3"))
    parser.add_argument("--db-url", default=os.environ.get("MYSQL_DB_URL", DEFAULT_DB_URL))
    parser.add_argument("--username", default=os.environ.get("MYSQL_USERNAME", "root"))
    parser.add_argument("--password", help="prefer MYSQL_PASSWORD to avoid shell history exposure")
    parser.add_argument("--table", default="vehicles_20260723")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()
    if not args.table.replace("_", "").isalnum():
        parser.error("--table may contain only letters, numbers, and underscores")
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")
    return args


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    import_paths(parse_args())
