#!/usr/bin/env python3
"""Resumable crawler for A-Premium's year/make/model/trim/engine tree."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://external.a-premium.com/item/public/attr/value/child/car-model"
LEVEL_NAMES = ("year", "make", "model", "trim", "engine")
USER_AGENT = "yt-crawler/1.0 (+https://a-premium.com)"


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            attribute_id INTEGER NOT NULL,
            parent_id TEXT NOT NULL,
            root_id TEXT NOT NULL,
            level INTEGER NOT NULL,
            is_leaf INTEGER NOT NULL,
            value TEXT NOT NULL,
            fetched INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_pending
            ON nodes(fetched, is_leaf, attribute_id);
        CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
        """
    )
    return db


def request_children(parent_id: str, attribute_id: int, timeout: float, retries: int) -> list[dict]:
    query = urllib.parse.urlencode(
        {"parentId": parent_id, "attributeId": attribute_id, "make": ""}
    )
    request = urllib.request.Request(f"{API_URL}?{query}", headers={"User-Agent": USER_AGENT})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            if not isinstance(payload, list):
                raise ValueError(f"API returned {type(payload).__name__}, expected list")
            return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == retries:
                raise RuntimeError(
                    f"request failed: parentId={parent_id}, attributeId={attribute_id}"
                ) from exc
            delay = min(30.0, 2**attempt) + random.random()
            logging.warning("request failed (%s), retrying in %.1fs", exc, delay)
            time.sleep(delay)
    raise AssertionError("unreachable")


def save_nodes(db: sqlite3.Connection, nodes: list[dict]) -> None:
    rows = []
    for node in nodes:
        try:
            rows.append(
                (
                    str(node["id"]), int(node["attributeId"]), str(node["parentId"]),
                    str(node["rootId"]), int(node["level"]), int(bool(node["isLeaf"])),
                    str(node["value"]),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"invalid API node: {node!r}") from exc
    db.executemany(
        """
        INSERT INTO nodes(id, attribute_id, parent_id, root_id, level, is_leaf, value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          attribute_id=excluded.attribute_id, parent_id=excluded.parent_id,
          root_id=excluded.root_id, level=excluded.level,
          is_leaf=excluded.is_leaf, value=excluded.value
        """,
        rows,
    )


def seed_years(db: sqlite3.Connection, years: set[str] | None, args: argparse.Namespace) -> int:
    nodes = request_children("-1", 1, args.timeout, args.retries)
    if years:
        nodes = [node for node in nodes if str(node.get("value")) in years]
        missing = years - {str(node["value"]) for node in nodes}
        if missing:
            raise ValueError(f"year not returned by API: {', '.join(sorted(missing))}")
    save_nodes(db, nodes)
    db.commit()
    return len(nodes)


def crawl(args: argparse.Namespace) -> None:
    db = open_db(args.database)
    requested_years = set(args.year) if args.year else None
    count = seed_years(db, requested_years, args)
    logging.info("seeded %d year(s)", count)
    requests_made = 0
    while args.max_requests is None or requests_made < args.max_requests:
        params: list[object] = []
        where = "fetched=0 AND is_leaf=0 AND attribute_id < 5"
        if requested_years:
            placeholders = ",".join("?" for _ in requested_years)
            where += (
                f" AND ((attribute_id=1 AND value IN ({placeholders}))"
                f" OR root_id IN (SELECT id FROM nodes WHERE attribute_id=1 AND value IN ({placeholders})))"
            )
            params.extend(sorted(requested_years))
            params.extend(sorted(requested_years))
        node = db.execute(
            f"SELECT id, attribute_id, value FROM nodes WHERE {where} ORDER BY attribute_id, id LIMIT 1",
            params,
        ).fetchone()
        if node is None:
            break
        next_attribute = node["attribute_id"] + 1
        children = request_children(node["id"], next_attribute, args.timeout, args.retries)
        save_nodes(db, children)
        db.execute("UPDATE nodes SET fetched=1 WHERE id=?", (node["id"],))
        db.commit()
        requests_made += 1
        logging.info("%s=%s -> %d child node(s)", LEVEL_NAMES[node["attribute_id"] - 1], node["value"], len(children))
        if args.delay:
            time.sleep(args.delay)
    logging.info("finished this run after %d child request(s)", requests_made)
    db.close()


def export_csv(database: Path, output: Path) -> None:
    db = open_db(database)
    rows = db.execute(
        "SELECT id, attribute_id, parent_id, is_leaf, value FROM nodes ORDER BY attribute_id, id"
    ).fetchall()
    nodes = {row["id"]: row for row in rows}
    output.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[*LEVEL_NAMES, "leaf_level", "leaf_id"])
        writer.writeheader()
        for row in rows:
            if not row["is_leaf"] and row["attribute_id"] < 5:
                continue
            values = {name: "" for name in LEVEL_NAMES}
            current = row
            seen: set[str] = set()
            while current and current["id"] not in seen:
                seen.add(current["id"])
                level = current["attribute_id"]
                if 1 <= level <= 5:
                    values[LEVEL_NAMES[level - 1]] = current["value"]
                current = nodes.get(current["parent_id"])
            writer.writerow({**values, "leaf_level": row["attribute_id"], "leaf_id": row["id"]})
            written += 1
    db.close()
    logging.info("exported %d vehicle path(s) to %s", written, output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("data/vehicles.sqlite3"))
    parser.add_argument("--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    crawl_parser = sub.add_parser("crawl", help="crawl or resume the API tree")
    crawl_parser.add_argument("--year", action="append", help="only crawl this year; repeatable")
    crawl_parser.add_argument("--delay", type=float, default=0.2, help="seconds between requests")
    crawl_parser.add_argument("--timeout", type=float, default=20.0)
    crawl_parser.add_argument("--retries", type=int, default=4)
    crawl_parser.add_argument("--max-requests", type=int, help="stop after N child requests")
    export_parser = sub.add_parser("export", help="export complete/early-leaf paths as CSV")
    export_parser.add_argument("--output", type=Path, default=Path("data/vehicles.csv"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.command == "crawl":
        crawl(args)
    else:
        export_csv(args.database, args.output)


if __name__ == "__main__":
    main()
