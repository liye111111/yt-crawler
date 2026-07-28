import { badRequest, distinctStrings, ok, routeError, yearParam } from "../query";

export async function GET(request: Request) {
  try {
    const year = yearParam(new URL(request.url));
    if (!year) return badRequest("year 参数无效");
    return ok({ items: await distinctStrings("SELECT DISTINCT make AS value FROM vehicle_paths WHERE year=? ORDER BY make COLLATE NOCASE", [year]) });
  } catch (error) { return routeError(error); }
}
