import { getD1 } from "../../../../db";
import { ok, routeError } from "../query";

export async function GET() {
  try {
    const db = getD1();
    const [counts, years, meta] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS vehicle_paths FROM vehicle_paths").first<{ vehicle_paths: number }>(),
      db.prepare("SELECT year, COUNT(DISTINCT make) AS makes FROM vehicle_paths GROUP BY year ORDER BY year DESC").all<{ year: number; makes: number }>(),
      db.prepare("SELECT key, value FROM data_meta").all<{ key: string; value: string }>(),
    ]);
    return ok({
      vehiclePaths: counts?.vehicle_paths ?? 0,
      years: years.results,
      meta: Object.fromEntries(meta.results.map((row) => [row.key, row.value])),
    });
  } catch (error) {
    return routeError(error);
  }
}
