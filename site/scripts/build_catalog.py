#!/usr/bin/env python3
"""Build browser-friendly, year-sharded JSON from the vehicle CSV."""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def clean(value: str | None) -> str:
    value = (value or "").strip()
    return "" if value.upper() == "NULL" else value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path.home() / "Downloads" / "vehicles_2026-07-27.csv",
    )
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"CSV not found: {args.input}")

    # year -> make -> model -> trim -> engines
    tree: dict[str, dict[str, dict[str, dict[str, set[str]]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    )
    source_rows = 0
    with args.input.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        expected = {"year", "make", "model", "trim", "engine"}
        if set(reader.fieldnames or []) != expected:
            raise SystemExit(f"expected CSV fields {sorted(expected)}, got {reader.fieldnames}")
        for row in reader:
            source_rows += 1
            year = clean(row["year"])
            make = clean(row["make"])
            model = clean(row["model"])
            trim = clean(row["trim"])
            engine = clean(row["engine"])
            if not year or not make or not model:
                continue
            if engine:
                tree[year][make][model][trim].add(engine)
            else:
                tree[year][make][model][trim]

    args.output.mkdir(parents=True, exist_ok=True)
    years = sorted(tree, key=int, reverse=True)
    path_count = 0
    manifest_years = []
    for year in years:
        makes_payload = []
        for make in sorted(tree[year], key=str.casefold):
            models_payload = []
            for model in sorted(tree[year][make], key=str.casefold):
                trims_payload = []
                for trim in sorted(tree[year][make][model], key=str.casefold):
                    engines = sorted(tree[year][make][model][trim], key=str.casefold)
                    trims_payload.append({"name": trim or None, "engines": engines})
                    path_count += max(1, len(engines))
                models_payload.append({"name": model, "trims": trims_payload})
            makes_payload.append({"name": make, "models": models_payload})
        payload = {"year": int(year), "makes": makes_payload}
        (args.output / f"{year}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        manifest_years.append({"year": int(year), "makes": len(makes_payload)})

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": args.input.name,
        "sourceRows": source_rows,
        "vehiclePaths": path_count,
        "years": manifest_years,
    }
    (args.output / "catalog.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"built {path_count:,} paths across {len(years)} year shards in {args.output}")


if __name__ == "__main__":
    main()
