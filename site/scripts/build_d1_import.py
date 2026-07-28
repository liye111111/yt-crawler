#!/usr/bin/env python3
"""Convert the vehicle CSV into D1-compatible batched INSERT statements."""

from __future__ import annotations

import argparse
import csv
import hashlib
from datetime import datetime, timezone
from pathlib import Path


def clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return None if not value or value.upper() == "NULL" else value


def normalized(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.casefold().replace("-", " ").split())


def quote(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path.home() / "Downloads" / "vehicles_2026-07-27.csv")
    parser.add_argument("--output", type=Path, default=Path("data/vehicle_paths.sql"))
    parser.add_argument("--batch-size", type=int, default=200)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"CSV not found: {args.input}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    columns = "year,make,model,trim,engine,make_normalized,model_normalized,trim_normalized,engine_normalized,path_key"
    batch: list[str] = []
    rows = 0
    with args.input.open(newline="", encoding="utf-8-sig") as source, args.output.open("w", encoding="utf-8") as output:
        output.write("DELETE FROM vehicle_paths;\nDELETE FROM data_meta;\n")
        for record in csv.DictReader(source):
            year = int(record["year"])
            make, model = clean(record["make"]), clean(record["model"])
            trim, engine = clean(record["trim"]), clean(record["engine"])
            if make is None or model is None:
                continue
            identity = "\x1f".join(str(value or "") for value in (year, make, model, trim, engine))
            path_key = hashlib.sha256(identity.encode()).hexdigest()
            values = (year, make, model, trim, engine, normalized(make), normalized(model), normalized(trim), normalized(engine), path_key)
            batch.append("(" + ",".join(quote(value) for value in values) + ")")
            rows += 1
            if len(batch) == args.batch_size:
                output.write(f"INSERT OR IGNORE INTO vehicle_paths ({columns}) VALUES\n" + ",\n".join(batch) + ";\n")
                batch.clear()
        if batch:
            output.write(f"INSERT OR IGNORE INTO vehicle_paths ({columns}) VALUES\n" + ",\n".join(batch) + ";\n")
        metadata = {
            "source_file": args.input.name,
            "source_rows": str(rows),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        values = ",".join(f"({quote(key)},{quote(value)})" for key, value in metadata.items())
        output.write(f"INSERT INTO data_meta (key,value) VALUES {values};\n")
    print(f"generated {rows:,} rows in {args.output}")


if __name__ == "__main__":
    main()
