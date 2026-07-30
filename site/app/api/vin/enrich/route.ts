import { env } from "cloudflare:workers";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.6-flash";

type VpicResult = Record<string, string | null>;
type SegmentKey = "wmi" | "vds" | "model-year" | "plant";
type Confidence = "low" | "medium" | "high";
type Status = "inferred" | "unverified";

type GeminiAnnotation = {
  type?: string;
  url?: string;
  title?: string;
};

type GeminiContent = {
  type?: string;
  text?: string;
  annotations?: GeminiAnnotation[];
};

type GeminiResponse = {
  output_text?: string;
  steps?: Array<{ type?: string; content?: GeminiContent[] }>;
};

type GeminiPayload = {
  summary?: unknown;
  vehicle?: unknown;
  modelCandidates?: unknown;
  segments?: unknown;
};

class GeminiUpstreamError extends Error {
  constructor(readonly status: number, readonly detail: string | null = null) {
    super(`Gemini HTTP ${status}`);
  }
}

function safeUpstreamDetail(value: string) {
  if (!value) return null;
  try {
    const payload = JSON.parse(value) as { error?: { status?: unknown; message?: unknown; details?: unknown } };
    return JSON.stringify({
      status: typeof payload.error?.status === "string" ? payload.error.status : undefined,
      message: typeof payload.error?.message === "string" ? payload.error.message.slice(0, 600) : undefined,
      details: Array.isArray(payload.error?.details) ? payload.error.details.slice(0, 3) : undefined,
    });
  } catch {
    return value.replace(/[\r\n]+/g, " ").slice(0, 600);
  }
}

function geminiEndpoint(accountId?: string, gatewayId?: string) {
  if (!accountId?.trim() || !gatewayId?.trim()) return GEMINI_DIRECT_URL;
  return `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId.trim())}/${encodeURIComponent(gatewayId.trim())}/google-ai-studio/v1beta/interactions`;
}

type EnrichedSegment = {
  key: SegmentKey;
  positions: string;
  value: string;
  meaning: string;
  evidence: string;
  status: Status;
  confidence: Confidence;
};

type EnrichedVehicle = {
  manufacturer: string | null;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  trim: string | null;
  bodyClass: string | null;
  engine: string | null;
  displacementLiters: string | null;
  fuelType: string | null;
  evidence: string;
  status: Status;
  confidence: Confidence;
};

type ModelCandidate = {
  make: string | null;
  model: string;
  platform: string | null;
  modelYear: string | null;
  bodyClass: string | null;
  possibleTrims: string[];
  reason: string;
  status: Status;
  confidence: Confidence;
};

const segmentMetadata: Record<SegmentKey, { positions: string; value: (vin: string) => string }> = {
  wmi: { positions: "1–3", value: (vin) => vin.slice(0, 3) },
  vds: { positions: "4–8", value: (vin) => vin.slice(3, 8) },
  "model-year": { positions: "10", value: (vin) => vin.slice(9, 10) },
  plant: { positions: "11", value: (vin) => vin.slice(10, 11) },
};

const responseSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A concise Chinese summary that clearly labels the result as an inference.",
    },
    vehicle: {
      type: "object",
      properties: {
        manufacturer: { type: "string", description: "Candidate vehicle manufacturer, or an empty string when unknown." },
        make: { type: "string", description: "Candidate vehicle make, or an empty string when unknown." },
        model: { type: "string", description: "Candidate vehicle model/series, or an empty string when unknown." },
        modelYear: { type: "string", description: "Candidate four-digit model year, or an empty string when unknown." },
        trim: { type: "string", description: "Candidate trim, or an empty string when unknown." },
        bodyClass: { type: "string", description: "Candidate body class, or an empty string when unknown." },
        engine: { type: "string", description: "Candidate engine description, or an empty string when unknown." },
        displacementLiters: { type: "string", description: "Candidate engine displacement in liters, or an empty string when unknown." },
        fuelType: { type: "string", description: "Candidate fuel type, or an empty string when unknown." },
        evidence: { type: "string", description: "Chinese explanation of how the candidate was inferred and its limitations." },
        status: { type: "string", enum: ["inferred", "unverified"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["manufacturer", "make", "model", "modelYear", "trim", "bodyClass", "engine", "displacementLiters", "fuelType", "evidence", "status", "confidence"],
    },
    modelCandidates: {
      type: "array",
      description: "Up to three plausible model candidates when the exact model cannot be confirmed.",
      items: {
        type: "object",
        properties: {
          make: { type: "string", description: "Candidate make, or an empty string when unknown." },
          model: { type: "string", description: "Candidate model or series name." },
          platform: { type: "string", description: "Candidate platform/chassis code, or an empty string when unknown." },
          modelYear: { type: "string", description: "Candidate model year, or an empty string when unknown." },
          bodyClass: { type: "string", description: "Candidate body class, or an empty string when unknown." },
          possibleTrims: { type: "array", items: { type: "string" } },
          reason: { type: "string", description: "Chinese explanation linking the VIN prefix/VDS to this candidate and stating uncertainty." },
          status: { type: "string", enum: ["inferred", "unverified"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["make", "model", "platform", "modelYear", "bodyClass", "possibleTrims", "reason", "status", "confidence"],
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["wmi", "vds", "model-year", "plant"] },
          meaning: { type: "string", description: "Chinese explanation of this VIN segment." },
          evidence: { type: "string", description: "Short Chinese description of the public evidence, or why it cannot be verified." },
          status: { type: "string", enum: ["inferred", "unverified"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["key", "meaning", "evidence", "status", "confidence"],
      },
    },
  },
  required: ["summary", "vehicle", "modelCandidates", "segments"],
} as const;

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "Not Applicable" ? normalized : null;
}

function truncate(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function extractModelOutput(response: GeminiResponse) {
  if (response.output_text) return response.output_text;
  const outputs = response.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && content.text)
    .map((content) => content.text as string);
  return outputs?.at(-1) ?? null;
}

function extractSources(response: GeminiResponse) {
  const seen = new Set<string>();
  return (response.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .flatMap((content) => content.annotations ?? [])
    .filter((annotation) => annotation.type === "url_citation" && annotation.url)
    .flatMap((annotation) => {
      try {
        const url = new URL(annotation.url as string);
        if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) return [];
        seen.add(url.href);
        return [{ title: truncate(annotation.title, 160) || url.hostname, url: url.href }];
      } catch {
        return [];
      }
    })
    .slice(0, 8);
}

function normalizeSegments(payload: GeminiPayload, vin: string, hasSources: boolean): EnrichedSegment[] {
  if (!Array.isArray(payload.segments)) return [];
  const seen = new Set<SegmentKey>();
  return payload.segments.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const key = item.key as SegmentKey;
    if (!(key in segmentMetadata) || seen.has(key)) return [];
    const meaning = truncate(item.meaning);
    if (!meaning) return [];
    seen.add(key);
    const status: Status = hasSources && item.status === "inferred" ? "inferred" : "unverified";
    const confidence: Confidence = item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low";
    const metadata = segmentMetadata[key];
    return [{
      key,
      positions: metadata.positions,
      value: metadata.value(vin),
      meaning,
      evidence: truncate(item.evidence) || "未提供可核验依据",
      status,
      confidence: status === "unverified" ? "low" : confidence,
    }];
  });
}

function normalizeVehicle(payload: GeminiPayload, hasSources: boolean): EnrichedVehicle {
  const item = payload.vehicle && typeof payload.vehicle === "object"
    ? payload.vehicle as Record<string, unknown>
    : {};
  const optional = (value: unknown) => truncate(value, 180) || null;
  const status: Status = hasSources && item.status === "inferred" ? "inferred" : "unverified";
  const confidence: Confidence = status === "inferred" && (item.confidence === "medium" || item.confidence === "high")
    ? item.confidence
    : "low";
  return {
    manufacturer: optional(item.manufacturer),
    make: optional(item.make),
    model: optional(item.model),
    modelYear: optional(item.modelYear),
    trim: optional(item.trim),
    bodyClass: optional(item.bodyClass),
    engine: optional(item.engine),
    displacementLiters: optional(item.displacementLiters),
    fuelType: optional(item.fuelType),
    evidence: truncate(item.evidence) || "模型未提供可核验依据",
    status,
    confidence,
  };
}

function normalizeModelCandidates(payload: GeminiPayload, hasSources: boolean): ModelCandidate[] {
  if (!Array.isArray(payload.modelCandidates)) return [];
  const seen = new Set<string>();
  return payload.modelCandidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const model = truncate(item.model, 120);
    if (!model) return [];
    const make = truncate(item.make, 120) || null;
    const key = `${make ?? ""}:${model}`.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const status: Status = hasSources && item.status === "inferred" ? "inferred" : "unverified";
    const confidence: Confidence = status === "inferred" && (item.confidence === "medium" || item.confidence === "high")
      ? item.confidence
      : "low";
    const possibleTrims = Array.isArray(item.possibleTrims)
      ? item.possibleTrims.map((value) => truncate(value, 100)).filter(Boolean).slice(0, 5)
      : [];
    return [{
      make,
      model,
      platform: truncate(item.platform, 100) || null,
      modelYear: truncate(item.modelYear, 20) || null,
      bodyClass: truncate(item.bodyClass, 100) || null,
      possibleTrims,
      reason: truncate(item.reason) || "模型未提供具体推断依据",
      status,
      confidence,
    }];
  }).slice(0, 3);
}

async function fetchVpic(vin: string, signal: AbortSignal) {
  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`vPIC HTTP ${response.status}`);
  const body = (await response.json()) as { Results?: VpicResult[] };
  return body.Results?.[0] ?? null;
}

function buildPrompt(vin: string, nhtsa: VpicResult | null, searchGrounding: boolean, locale: "zh" | "en" | "ja") {
  const known = {
    modelYear: clean(nhtsa?.ModelYear),
    make: clean(nhtsa?.Make),
    model: clean(nhtsa?.Model),
    manufacturer: clean(nhtsa?.Manufacturer),
    vehicleType: clean(nhtsa?.VehicleType),
    bodyClass: clean(nhtsa?.BodyClass),
    engine: clean(nhtsa?.EngineModel),
    displacementLiters: clean(nhtsa?.DisplacementL),
    plantCountry: clean(nhtsa?.PlantCountry),
    plantState: clean(nhtsa?.PlantState),
    plantCity: clean(nhtsa?.PlantCity),
    nhtsaError: clean(nhtsa?.ErrorText),
  };
  const maskedVin = `${vin.slice(0, 11)}******`;
  const language = locale === "en" ? "English" : locale === "ja" ? "日本語" : "简体中文";
  return [
    searchGrounding
      ? "你是车辆 VIN 研究助手。请使用 Google Search 查找公开、可核验的 VIN 编码资料，补充 NHTSA 未返回的基础解释。"
      : "你是车辆 VIN 研究助手。请根据 VIN 标准常识解释基础字段，但不得把模型记忆描述为已核验事实。",
    "必须遵守：不要猜测生产序列号；不要把车型常识写成已确认事实；厂商内部 VDS 或工厂码没有可靠公开资料时标记 unverified；不得覆盖或否定 NHTSA 已返回的字段。",
    searchGrounding
      ? `优先使用制造商、政府、标准组织或可信行业资料。所有自然语言字段必须使用${language}。`
      : `当前没有联网检索和来源核验能力，因此所有模型补充内容必须标记 unverified，confidence 必须为 low。所有自然语言字段必须使用${language}。`,
    `脱敏 VIN：${maskedVin}`,
    `WMI：${vin.slice(0, 3)}；VDS：${vin.slice(3, 8)}；年款码：${vin.slice(9, 10)}；工厂码：${vin.slice(10, 11)}`,
    `NHTSA 已知结果：${JSON.stringify(known)}`,
    "同时返回 vehicle 候选车型字段和 wmi、vds、model-year、plant 四段解释。",
    "vehicle 中尽可能给出 manufacturer、make、model、modelYear、trim、bodyClass、engine、displacementLiters、fuelType；无法合理判断的字段必须返回空字符串，不得为了填满字段而编造。",
    "如果无法唯一确认 vehicle.model，vehicle.model 保持空字符串，但必须尽量根据模型已有的 VIN/VDS 编码知识返回最多3个 modelCandidates。不要因为缺少公开来源而省略合理候选项。",
    "每个 modelCandidates 项应给出 make、model、platform、modelYear、bodyClass、possibleTrims 和具体推断理由；模型记忆产生的候选必须标记 unverified 和 low。",
    "segments 的 meaning 解释编码含义，evidence 简述依据；证据不足必须使用 unverified 和 low。",
  ].join("\n");
}

export async function POST(request: Request) {
  let body: { vin?: string; locale?: string };
  try {
    body = (await request.json()) as { vin?: string; locale?: string };
  } catch {
    return Response.json({ ok: false, error: { code: "INVALID_JSON", message: "请求内容不是有效 JSON" } }, { status: 400 });
  }

  const vin = body.vin?.trim().toUpperCase() ?? "";
  const locale = body.locale === "en" || body.locale === "ja" ? body.locale : "zh";
  if (!VIN_PATTERN.test(vin)) {
    return Response.json(
      { ok: false, error: { code: "INVALID_VIN", message: "VIN 必须是17位，且不能包含 I、O、Q" } },
      { status: 400 },
    );
  }

  const bindings = env as unknown as {
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_SEARCH_GROUNDING?: string;
    GEMINI_DEBUG_LOG?: string;
    CF_AI_GATEWAY_ACCOUNT_ID?: string;
    CF_AI_GATEWAY_ID?: string;
    CF_AI_GATEWAY_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
  };
  const apiKey = bindings.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { ok: false, error: { code: "GEMINI_NOT_CONFIGURED", message: "Gemini 补充解析尚未配置" } },
      { status: 503 },
    );
  }

  const debugLog = bindings.GEMINI_DEBUG_LOG?.trim().toLowerCase() === "true";
  const maskedVin = `${vin.slice(0, 11)}******`;
  if (debugLog) console.info("[vin:gemini:start]", JSON.stringify({ maskedVin, locale }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    let nhtsa: VpicResult | null = null;
    try {
      nhtsa = await fetchVpic(vin, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      // Gemini may still explain deterministic VIN segments if vPIC is temporarily unavailable.
    }

    const model = bindings.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    const searchGrounding = bindings.GEMINI_SEARCH_GROUNDING?.trim().toLowerCase() === "true";
    const gatewayAccountId = bindings.CF_AI_GATEWAY_ACCOUNT_ID || bindings.CLOUDFLARE_ACCOUNT_ID;
    const geminiUrl = geminiEndpoint(gatewayAccountId, bindings.CF_AI_GATEWAY_ID);
    const requestBody: Record<string, unknown> = {
      model,
      input: buildPrompt(vin, nhtsa, searchGrounding, locale),
      system_instruction: "Return conservative VIN research. Never invent a decoding rule.",
      response_format: { type: "text", mime_type: "application/json", schema: responseSchema },
      generation_config: { max_output_tokens: 1400, thinking_level: "low" },
      store: false,
    };
    if (searchGrounding) requestBody.tools = [{ type: "google_search" }];
    if (debugLog) {
      console.info("[vin:gemini:request]", JSON.stringify({
        url: geminiUrl,
        method: "POST",
        maskedVin,
        requestBody,
      }, null, 2));
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };
    const gatewayToken = bindings.CF_AI_GATEWAY_TOKEN?.trim();
    if (gatewayToken) headers["cf-aig-authorization"] = `Bearer ${gatewayToken}`;
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      // Keep a short, sanitized provider diagnostic for Worker debug logs only.
      // It is never included in the public API response.
      const upstreamDetail = safeUpstreamDetail(await upstream.text());
      throw new GeminiUpstreamError(upstream.status, upstreamDetail);
    }
    const gemini = (await upstream.json()) as GeminiResponse;
    const output = extractModelOutput(gemini);
    if (!output) throw new Error("Gemini returned no model output");
    const parsed = JSON.parse(output) as GeminiPayload;
    const sources = extractSources(gemini);
    const hasGroundedSources = searchGrounding && sources.length > 0;
    const vehicle = normalizeVehicle(parsed, hasGroundedSources);
    const modelCandidates = normalizeModelCandidates(parsed, hasGroundedSources);
    const segments = normalizeSegments(parsed, vin, hasGroundedSources);
    if (!segments.length) throw new Error("Gemini returned no usable VIN segments");
    if (debugLog) {
      console.info("[vin:gemini:success]", JSON.stringify({
        maskedVin,
        vehicle,
        modelCandidateCount: modelCandidates.length,
        segmentCount: segments.length,
        sourceCount: sources.length,
      }, null, 2));
    }

    return Response.json(
      {
        ok: true,
        data: {
          vin: `${vin.slice(0, 11)}******`,
          model,
          source: searchGrounding ? "gemini-google-search" : "gemini-model",
          searchGrounding,
          summary: truncate(parsed.summary) || "AI 对 VIN 基础字段进行了补充分析。",
          vehicle,
          modelCandidates,
          segments,
          sources,
          disclaimer: searchGrounding
            ? "AI 内容是基于公开网页的补充推断，不是制造商或政府出具的车辆认证结果；未核验字段不得作为唯一判断依据。"
            : "AI 内容来自模型知识，未经联网搜索或外部来源核验；不得作为车辆身份或配置判断的唯一依据。",
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const upstreamStatus = error instanceof GeminiUpstreamError ? error.status : null;
    const upstreamDetail = error instanceof GeminiUpstreamError ? error.detail : null;
    const rateLimited = upstreamStatus === 429;
    const unauthorized = upstreamStatus === 401 || upstreamStatus === 403;
    if (debugLog) {
      console.error("[vin:gemini:error]", JSON.stringify({
        maskedVin,
        category: timedOut ? "timeout" : upstreamStatus ? "upstream" : "invalid-response",
        upstreamStatus,
        upstreamDetail,
        message: error instanceof Error ? error.message : "unknown error",
      }));
    }
    return Response.json(
      {
        ok: false,
        error: {
          code: timedOut
            ? "GEMINI_TIMEOUT"
            : rateLimited
              ? "GEMINI_RATE_LIMITED"
              : unauthorized
                ? "GEMINI_AUTH_FAILED"
                : "GEMINI_UNAVAILABLE",
          message: timedOut
            ? "Gemini 补充解析超时，请稍后重试"
            : rateLimited
              ? "Gemini 查询额度暂不可用，请稍后重试或检查计费设置"
              : unauthorized
                ? "Gemini 服务认证失败，请检查 Worker Secret"
                : "Gemini 补充解析暂时不可用",
        },
      },
      { status: rateLimited ? 429 : unauthorized ? 503 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
