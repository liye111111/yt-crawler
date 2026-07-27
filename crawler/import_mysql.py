#!/usr/bin/env python3
"""Import the crawler's SQLite nodes table into MySQL."""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

DEFAULT_DB_URL = (
    "jdbc:mysql://129.211.12.58:22008/yt"
    "?characterEncoding=utf-8&useSSL=false&serverTimeZone=GMT+8"
)


def parse_jdbc_url(value: str) -> dict[str, object]:
    if not value.startswith("jdbc:mysql://"):
        raise ValueError("db-url must start with jdbc:mysql://")
    parsed = urlsplit(value.removeprefix("jdbc:"))
    database = parsed.path.lstrip("/")
    if not parsed.hostname or not database:
        raise ValueError("db-url must contain a host and database name")
    query = parse_qs(parsed.query)
    charset = query.get("characterEncoding", ["utf8mb4"])[0].replace("-", "")
    if charset.lower() == "utf8":
        charset = "utf8mb4"
    return {
        "host": parsed.hostname,
        "port": parsed.port or 3306,
        "database": database,
        "charset": charset,
        "ssl_disabled": query.get("useSSL", ["true"])[0].lower() == "false",
    }


def validate_sqlite(db: sqlite3.Connection) -> int:
    table = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='nodes'"
    ).fetchone()
    if table is None:
        raise RuntimeError("SQLite database has no 'nodes' table; run crawler.py first")
    return int(db.execute("SELECT COUNT(*) FROM nodes").fetchone()[0])


def load_normalized_nodes(db: sqlite3.Connection) -> list[tuple[object, ...]]:
    """Load nodes and replace missing API rootId values with their year ancestor ID."""
    records = db.execute(
        "SELECT id, attribute_id, parent_id, root_id, level, is_leaf, value, fetched FROM nodes"
    ).fetchall()
    by_id = {str(record["id"]): record for record in records}

    def integer(value: object) -> int | None:
        try:
            return int(str(value))
        except (TypeError, ValueError):
            return None

    def year_ancestor_id(record: sqlite3.Row) -> int:
        current = record
        seen: set[str] = set()
        while int(current["attribute_id"]) > 1:
            current_id = str(current["id"])
            if current_id in seen:
                raise ValueError(f"cycle detected in parent chain at node {current_id}")
            seen.add(current_id)
            parent = by_id.get(str(current["parent_id"]))
            if parent is None:
                raise ValueError(f"missing parent {current['parent_id']} for node {current_id}")
            current = parent
        return int(str(current["id"]))

    normalized = []
    for record in records:
        node_id = integer(record["id"])
        parent_id = integer(record["parent_id"])
        root_id = integer(record["root_id"])
        if node_id is None or parent_id is None:
            raise ValueError(f"invalid node or parent ID in SQLite row: {dict(record)!r}")
        if root_id is None:
            root_id = year_ancestor_id(record)
            logging.warning("node %s has root_id=%r; using year ancestor %s", node_id, record["root_id"], root_id)
        normalized.append(
            (
                node_id, int(record["attribute_id"]), parent_id, root_id,
                int(record["level"]), int(record["is_leaf"]),
                str(record["value"]), int(record["fetched"]),
            )
        )
    return normalized


def import_nodes(args: argparse.Namespace) -> None:
    try:
        import mysql.connector
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency. Install it with: python3 -m pip install -r requirements.txt"
        ) from exc

    password = args.password or os.environ.get("MYSQL_PASSWORD")
    if not password:
        raise SystemExit("Set MYSQL_PASSWORD or pass --password")

    if not args.sqlite.is_file():
        raise SystemExit(f"SQLite database not found: {args.sqlite}")
    sqlite_db = sqlite3.connect(args.sqlite)
    sqlite_db.row_factory = sqlite3.Row
    total = validate_sqlite(sqlite_db)
    config = parse_jdbc_url(args.db_url)
    logging.info(
        "importing %d rows into mysql://%s:%s/%s.%s",
        total, config["host"], config["port"], config["database"], args.table,
    )
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
        f"""
        CREATE TABLE IF NOT EXISTS {quoted_table} (
            id BIGINT NOT NULL,
            attribute_id TINYINT UNSIGNED NOT NULL,
            parent_id BIGINT NOT NULL,
            root_id BIGINT NOT NULL,
            level TINYINT UNSIGNED NOT NULL,
            is_leaf BOOLEAN NOT NULL,
            value VARCHAR(512) NOT NULL,
            fetched BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (id),
            KEY idx_parent_id (parent_id),
            KEY idx_pending (fetched, is_leaf, attribute_id),
            KEY idx_root_id (root_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    upsert = f"""
        INSERT INTO {quoted_table}
            (id, attribute_id, parent_id, root_id, level, is_leaf, value, fetched)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            attribute_id=VALUES(attribute_id), parent_id=VALUES(parent_id),
            root_id=VALUES(root_id), level=VALUES(level),
            is_leaf=VALUES(is_leaf), value=VALUES(value), fetched=VALUES(fetched)
    """
    source_rows = load_normalized_nodes(sqlite_db)
    imported = 0
    for offset in range(0, len(source_rows), args.batch_size):
        rows = source_rows[offset : offset + args.batch_size]
        cursor.executemany(upsert, rows)
        mysql_db.commit()
        imported += len(rows)
        logging.info("imported %d/%d", imported, total)
    cursor.close()
    mysql_db.close()
    sqlite_db.close()
    logging.info("done: %d row(s) imported", imported)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=Path("data/vehicles.sqlite3"))
    parser.add_argument("--db-url", default=os.environ.get("MYSQL_DB_URL", DEFAULT_DB_URL))
    parser.add_argument("--username", default=os.environ.get("MYSQL_USERNAME", "root"))
    parser.add_argument("--password", help="prefer MYSQL_PASSWORD to avoid shell history exposure")
    parser.add_argument("--table", default="vehicle_nodes")
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
    import_nodes(parse_args())
