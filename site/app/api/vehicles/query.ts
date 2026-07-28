import { getD1 } from "../../../db";

export function badRequest(message: string) {
  return Response.json({ ok: false, error: { code: "INVALID_ARGUMENT", message } }, { status: 400 });
}

export function ok(data: unknown) {
  return Response.json({ ok: true, data }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" } });
}

export function yearParam(url: URL) {
  const year = Number(url.searchParams.get("year"));
  return Number.isInteger(year) && year >= 1886 && year <= 2100 ? year : null;
}

export function required(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();
  return value || null;
}

export async function distinctStrings(sql: string, values: unknown[]) {
  const result = await getD1().prepare(sql).bind(...values).all<{ value: string | null }>();
  return result.results.map((row) => row.value);
}

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "车型数据库查询失败";
  const unavailable = message.includes("no such table") || message.includes("binding `DB`");
  return Response.json(
    {
      ok: false,
      error: {
        code: unavailable ? "DATABASE_NOT_READY" : "DATABASE_ERROR",
        message: unavailable ? "本地车型数据库尚未导入" : "车型数据库查询失败",
      },
    },
    { status: unavailable ? 503 : 500 },
  );
}
