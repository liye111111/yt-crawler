import { getD1 } from "../../../../db";
import { badRequest, ok, required, routeError, yearParam } from "../query";

type CanadianResult = { Specs?: { Name?: string; Value?: string }[] };
type ModelResult = { Model_Name?: string };

const normalize = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function nhtsaJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = yearParam(url);
    const make = required(url, "make");
    const model = required(url, "model");
    if (!year || !make || !model) return badRequest("year、make 和 model 为必填参数");

    const db = getD1();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    const canadianParams = new URLSearchParams({ year: String(year), make, model, units: "Metric", format: "json" });
    const modelUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;

    try {
      const [local, canadian, models] = await Promise.all([
        db.prepare(`SELECT COUNT(*) AS paths, COUNT(DISTINCT trim) AS trims, COUNT(DISTINCT engine) AS engines
          FROM vehicle_paths WHERE year=? AND make=? AND model=?`).bind(year, make, model).first<{ paths: number; trims: number; engines: number }>(),
        nhtsaJson<{ Results?: CanadianResult[] }>(`https://vpic.nhtsa.dot.gov/api/vehicles/GetCanadianVehicleSpecifications/?${canadianParams}`, controller.signal),
        nhtsaJson<{ Results?: ModelResult[] }>(modelUrl, controller.signal),
      ]);
      const specs = canadian?.Results?.[0]?.Specs ?? [];
      const dimensions = Object.fromEntries(specs.map((item) => [item.Name, item.Value]).filter(([name, value]) => name && value));
      const modelMatch = models?.Results?.find((item) => normalize(item.Model_Name) === normalize(model));
      return ok({
        source: "vehicle-selection",
        year,
        make,
        model,
        local: { paths: local?.paths ?? 0, trims: local?.trims ?? 0, engines: local?.engines ?? 0 },
        nhtsaModelMatched: Boolean(modelMatch),
        dimensions,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return routeError(error);
  }
}
