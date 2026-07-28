const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

type VpicResult = Record<string, string | null>;

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "Not Applicable" ? normalized : null;
}

export async function POST(request: Request) {
  let payload: { vin?: string };
  try {
    payload = (await request.json()) as { vin?: string };
  } catch {
    return Response.json(
      { ok: false, error: { code: "INVALID_JSON", message: "请求内容不是有效 JSON" } },
      { status: 400 },
    );
  }

  const vin = payload.vin?.trim().toUpperCase() ?? "";
  if (!VIN_PATTERN.test(vin)) {
    return Response.json(
      { ok: false, error: { code: "INVALID_VIN", message: "VIN 必须是17位，且不能包含 I、O、Q" } },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const upstream = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!upstream.ok) throw new Error(`vPIC HTTP ${upstream.status}`);
    const body = (await upstream.json()) as { Results?: VpicResult[] };
    const result = body.Results?.[0];
    if (!result) throw new Error("vPIC returned no result");

    const errorCode = text(result.ErrorCode);
    const decoded = {
      year: Number.parseInt(text(result.ModelYear) ?? "", 10) || null,
      make: text(result.Make),
      model: text(result.Model),
      trim: text(result.Trim) ?? text(result.Trim2),
      displacementLiters: text(result.DisplacementL),
      cylinders: text(result.EngineCylinders),
      fuelType: text(result.FuelTypePrimary),
      bodyClass: text(result.BodyClass),
      manufacturer: text(result.Manufacturer),
      series: text(result.Series),
      vehicleType: text(result.VehicleType),
      doors: text(result.Doors),
      seats: text(result.Seats),
      driveType: text(result.DriveType),
      transmissionStyle: text(result.TransmissionStyle),
      transmissionSpeeds: text(result.TransmissionSpeeds),
      engineConfiguration: text(result.EngineConfiguration),
      engineModel: text(result.EngineModel),
      horsepower: text(result.EngineHP),
      electrificationLevel: text(result.ElectrificationLevel),
      fuelTypeSecondary: text(result.FuelTypeSecondary),
      plantCountry: text(result.PlantCountry),
      plantState: text(result.PlantState),
      plantCity: text(result.PlantCity),
      gvwr: text(result.GVWR),
      brakeSystemType: text(result.BrakeSystemType),
    };

    return Response.json(
      {
        ok: true,
        data: {
          vin,
          decoded,
          warning: errorCode && errorCode !== "0" ? text(result.ErrorText) : null,
        },
      },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=604800" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      {
        ok: false,
        error: {
          code: timedOut ? "VPIC_TIMEOUT" : "VPIC_UNAVAILABLE",
          message: timedOut ? "VIN 服务响应超时，请稍后重试" : "VIN 服务暂时不可用，请稍后重试",
        },
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
