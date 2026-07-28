import { badRequest, distinctStrings, ok, required, routeError, yearParam } from "../query";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const year = yearParam(url); const make = required(url, "make"); const model = required(url, "model");
    if (!year || !make || !model) return badRequest("year、make 和 model 为必填参数");
    const trim = url.searchParams.get("trim");
    const sql = trim === "__none__"
      ? "SELECT DISTINCT engine AS value FROM vehicle_paths WHERE year=? AND make=? AND model=? AND trim IS NULL ORDER BY engine COLLATE NOCASE"
      : "SELECT DISTINCT engine AS value FROM vehicle_paths WHERE year=? AND make=? AND model=? AND trim=? ORDER BY engine COLLATE NOCASE";
    const values = trim === "__none__" ? [year, make, model] : [year, make, model, trim ?? ""];
    return ok({ items: await distinctStrings(sql, values) });
  } catch (error) { return routeError(error); }
}
