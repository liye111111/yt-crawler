type CommonsMetadata = Record<string, { value?: string }>;
type CommonsPage = {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: CommonsMetadata;
  }[];
};

function plainText(value?: string) {
  return value
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function trustedUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("wikimedia.org") ? url.toString() : null;
  } catch {
    return null;
  }
}

function trustedLicenseUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowed = url.hostname.endsWith("wikimedia.org") || url.hostname.endsWith("creativecommons.org");
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const year = input.get("year")?.trim() ?? "";
  const make = input.get("make")?.trim() ?? "";
  const model = input.get("model")?.trim() ?? "";
  if (!make || !model || make.length > 80 || model.length > 120 || year.length > 4) {
    return Response.json(
      { ok: false, error: { code: "INVALID_VEHICLE", message: "make 和 model 为必填参数" } },
      { status: 400 },
    );
  }

  const query = [year, make, model, "automobile"].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1200",
    iiextmetadatafilter: "ImageDescription|Artist|Credit|LicenseShortName|LicenseUrl",
    format: "json",
    formatversion: "2",
  });

  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "VehicleLens/0.1 (vehicle image lookup)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Commons returned ${response.status}`);
    const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
    const candidates = payload.query?.pages ?? [];
    const images = [];
    const seen = new Set<string>();
    for (const page of candidates) {
      const info = page.imageinfo?.[0];
      if (!info?.mime?.startsWith("image/") || info.mime === "image/svg+xml") continue;
      const imageUrl = trustedUrl(info.thumburl ?? info.url);
      const sourceUrl = trustedUrl(info.descriptionurl);
      if (!imageUrl || !sourceUrl || seen.has(imageUrl)) continue;
      const metadata = info.extmetadata ?? {};
      seen.add(imageUrl);
      images.push({
        title: page.title?.replace(/^File:/, "") ?? `${make} ${model}`,
        imageUrl,
        sourceUrl,
        description: plainText(metadata.ImageDescription?.value),
        artist: plainText(metadata.Artist?.value),
        license: plainText(metadata.LicenseShortName?.value),
        licenseUrl: trustedLicenseUrl(metadata.LicenseUrl?.value),
      });
      if (images.length === 5) break;
    }

    return Response.json(
      {
        ok: true,
        data: {
          query,
          images,
        },
      },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
    );
  } catch (cause) {
    console.error("Wikimedia Commons image lookup failed", cause);
    return Response.json(
      { ok: false, error: { code: "IMAGE_LOOKUP_UNAVAILABLE", message: "车型参考图暂时无法加载" } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
