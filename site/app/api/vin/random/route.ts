const RANDOM_VIN_URL = "https://randomvin.com/getvin.php?type=real";
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export async function GET() {
  try {
    const upstream = await fetch(RANDOM_VIN_URL, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      throw new Error(`upstream returned ${upstream.status}`);
    }

    const vin = (await upstream.text()).trim().toUpperCase();
    if (!VIN_PATTERN.test(vin)) {
      throw new Error("upstream returned an invalid VIN");
    }

    return Response.json(
      { ok: true, data: { vin } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("RandomVIN request failed", cause);
    return Response.json(
      {
        ok: false,
        error: { code: "RANDOM_VIN_UNAVAILABLE", message: "随机 VIN 服务暂时不可用，请稍后重试" },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
