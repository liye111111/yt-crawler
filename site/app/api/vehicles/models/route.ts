import { badRequest, distinctStrings, ok, required, routeError, yearParam } from "../query";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const year = yearParam(url); const make = required(url, "make");
    if (!year || !make) return badRequest("year 和 make 为必填参数");
    return ok({ items: await distinctStrings("SELECT DISTINCT model AS value FROM vehicle_paths WHERE year=? AND make=? ORDER BY model COLLATE NOCASE", [year, make]) });
  } catch (error) { return routeError(error); }
}
