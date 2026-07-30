"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Locale, translate } from "./i18n";

type Catalog = {
  vehiclePaths: number;
  years: { year: number; makes: number }[];
  meta: Record<string, string>;
};
type Decoded = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  displacementLiters: string | null;
  cylinders: string | null;
  fuelType: string | null;
  bodyClass: string | null;
  manufacturer: string | null;
  series: string | null;
  nhtsaModelMatched: boolean;
  doors: string | null;
  seats: string | null;
  driveType: string | null;
  transmissionStyle: string | null;
  transmissionSpeeds: string | null;
  engineConfiguration: string | null;
  engineModel: string | null;
  horsepower: string | null;
  electrificationLevel: string | null;
  fuelTypeSecondary: string | null;
  plantCountry: string | null;
  plantState: string | null;
  plantCity: string | null;
  gvwr: string | null;
  brakeSystemType: string | null;
};
type VinPattern = {
  pattern: string;
  knownCharacters: number;
  totalCharacters: number;
  disclaimer: string;
  source: "nhtsa" | "vehicle-selection";
  segments: {
    positions: string;
    value: string;
    key: string;
    abbreviation: string;
    name: string;
    known: boolean;
    description: string;
    nhtsaResult: string | null;
  }[];
};
type VehicleImage = {
  title: string;
  imageUrl: string;
  sourceUrl: string;
  description: string | null;
  artist: string | null;
  license: string | null;
  licenseUrl: string | null;
};
type ManualDetails = {
  source: "vehicle-selection";
  year: number;
  make: string;
  model: string;
  local: { paths: number; trims: number; engines: number };
  vehicleType: string | null;
  dimensions: Record<string, string>;
};
type AiEnrichment = {
  vin: string;
  source: "gemini-model" | "gemini-google-search";
  searchGrounding: boolean;
  summary: string;
  vehicle: {
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
    status: "inferred" | "unverified";
    confidence: "low" | "medium" | "high";
  };
  modelCandidates: {
    make: string | null;
    model: string;
    platform: string | null;
    modelYear: string | null;
    bodyClass: string | null;
    possibleTrims: string[];
    reason: string;
    status: "inferred" | "unverified";
    confidence: "low" | "medium" | "high";
  }[];
  disclaimer: string;
};

const NONE = "__none__";
class ApiError extends Error {
  constructor(readonly code: string) { super(code); }
}
const normalize = (value: string | null) =>
  (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findName(items: (string | null)[], target: string | null) {
  const key = normalize(target);
  return items.find((item) => normalize(item) === key) ?? null;
}

async function api<T>(path: string, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${path}${query}`);
  const body = await response.json();
  if (!response.ok || !body.ok) throw new ApiError(body.error?.code ?? "UNKNOWN");
  return body.data as T;
}

async function options(path: string, params: Record<string, string>) {
  return (await api<{ items: (string | null)[] }>(path, params)).items;
}

export function VehicleFinder() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [lookupMode, setLookupMode] = useState<"vin" | "manual">("vin");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [engine, setEngine] = useState("");
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [trims, setTrims] = useState<(string | null)[]>([]);
  const [engines, setEngines] = useState<(string | null)[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [vin, setVin] = useState("");
  const [vinLoading, setVinLoading] = useState(false);
  const [randomVinLoading, setRandomVinLoading] = useState(false);
  const [error, setError] = useState("");
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [decodedVin, setDecodedVin] = useState("");
  const [matchNote, setMatchNote] = useState("");
  const [aiEnrichment, setAiEnrichment] = useState<AiEnrichment | null>(null);
  const [aiEnrichmentLoading, setAiEnrichmentLoading] = useState(false);
  const [aiEnrichmentError, setAiEnrichmentError] = useState("");
  const [vinPattern, setVinPattern] = useState<VinPattern | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [vehicleImages, setVehicleImages] = useState<VehicleImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageSearched, setImageSearched] = useState(false);
  const [manualDetails, setManualDetails] = useState<ManualDetails | null>(null);
  const [manualDetailsLoading, setManualDetailsLoading] = useState(false);
  const enrichmentCache = useRef(new Map<string, AiEnrichment>());
  const enrichmentRequest = useRef<{ key: string; id: number } | null>(null);
  const enrichmentSequence = useRef(0);
  const t = (key: string) => translate(locale, key);
  const errorText = (cause: unknown, fallbackKey: string) => {
    const key = cause instanceof ApiError ? `error_${cause.code}` : fallbackKey;
    const translated = t(key);
    return translated === key ? t(fallbackKey) : translated;
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("vehicle-lens-locale");
    const browser = navigator.language.toLowerCase();
    const next: Locale = saved === "en" || saved === "ja" || saved === "zh"
      ? saved
      : browser.startsWith("ja") ? "ja" : browser.startsWith("en") ? "en" : "zh";
    setLocale(next);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vehicle-lens-locale", locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja" : "en";
  }, [locale]);

  useEffect(() => {
    api<Catalog>("/api/vehicles/catalog")
      .then(setCatalog)
      .catch((cause) => setError(errorText(cause, "error_database")));
  }, []);

  function clearAfter(level: "year" | "make" | "model" | "trim") {
    if (level === "year") { setMake(""); setMakes([]); }
    if (level === "year" || level === "make") { setModel(""); setModels([]); }
    if (level !== "trim") { setTrim(""); setTrims([]); }
    setEngine(""); setEngines([]);
  }

  async function chooseYear(value: string) {
    setYear(value); clearAfter("year");
    if (!value) return [];
    setQueryLoading(true); setError("");
    try {
      const items = (await options("/api/vehicles/makes", { year: value })).filter((item): item is string => item !== null);
      setMakes(items); return items;
    } catch (cause) { setError(errorText(cause, "error_vehicleQuery")); return []; }
    finally { setQueryLoading(false); }
  }

  async function chooseMake(value: string, selectedYear = year) {
    setMake(value); clearAfter("make");
    if (!value) return [];
    const items = (await options("/api/vehicles/models", { year: selectedYear, make: value })).filter((item): item is string => item !== null);
    setModels(items); return items;
  }

  async function chooseModel(value: string, selectedYear = year, selectedMake = make) {
    setModel(value); clearAfter("model");
    if (!value) return [];
    const items = await options("/api/vehicles/trims", { year: selectedYear, make: selectedMake, model: value });
    setTrims(items); return items;
  }

  async function chooseTrim(value: string, selectedYear = year, selectedMake = make, selectedModel = model) {
    setTrim(value); clearAfter("trim");
    if (!value) return [];
    const items = await options("/api/vehicles/engines", { year: selectedYear, make: selectedMake, model: selectedModel, trim: value });
    setEngines(items); return items;
  }

  const result = useMemo(() => {
    if (!year || !make || !model) return null;
    return {
      year, make, model,
      trim: trim && trim !== NONE ? trim : null,
      engine: engine && engine !== NONE ? engine : null,
    };
  }, [year, make, model, trim, engine]);

  const patternVehicle = useMemo(() => lookupMode === "manual" ? result : (
    decodedVin && (decoded?.year || aiEnrichment?.vehicle.modelYear) && (decoded?.make || aiEnrichment?.vehicle.make) && (decoded?.model || aiEnrichment?.vehicle.model)
      ? {
          year: String(decoded?.year || aiEnrichment?.vehicle.modelYear),
          make: decoded?.make || aiEnrichment?.vehicle.make as string,
          model: decoded?.model || aiEnrichment?.vehicle.model as string,
          trim: decoded?.trim || aiEnrichment?.vehicle.trim,
          engine: aiEnrichment?.vehicle.engine ?? null,
        }
      : null
  ), [lookupMode, result, decodedVin, decoded, aiEnrichment]);
  const imageVehicle = useMemo(() => {
    if (lookupMode === "manual") {
      return year && make && model ? { year: Number(year), make, model, inferred: false } : null;
    }
    const candidate = aiEnrichment?.modelCandidates[0] ?? null;
    const imageYear = decoded?.year || Number(aiEnrichment?.vehicle.modelYear || candidate?.modelYear) || null;
    const imageMake = decoded?.make || aiEnrichment?.vehicle.make || candidate?.make;
    const imageModel = decoded?.model || aiEnrichment?.vehicle.model || candidate?.model;
    if (!imageYear || !imageMake || !imageModel) return null;
    return { year: imageYear, make: imageMake, model: imageModel, inferred: !decoded?.model };
  }, [lookupMode, year, make, model, decoded, aiEnrichment]);

  useEffect(() => {
    if (!patternVehicle) { setVinPattern(null); setPatternLoading(false); return; }
    const controller = new AbortController();
    setVinPattern(null);
    setPatternLoading(true);
    fetch("/api/vin/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...patternVehicle,
        locale,
        vin: lookupMode === "vin" ? decodedVin || null : null,
        decoded: lookupMode === "vin" && decodedVin ? decoded : null,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new ApiError(payload.error?.code ?? "VIN_PATTERN_UNAVAILABLE");
        setVinPattern(payload.data as VinPattern);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setError(errorText(cause, "error_VIN_PATTERN_UNAVAILABLE"));
      })
      .finally(() => { if (!controller.signal.aborted) setPatternLoading(false); });
    return () => controller.abort();
  }, [locale, lookupMode, patternVehicle, decodedVin, decoded]);

  useEffect(() => {
    if (lookupMode !== "manual") return;
    if (!year || !make || !model) {
      setManualDetails(null); setManualDetailsLoading(false); return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ year, make, model });
    setManualDetails(null); setManualDetailsLoading(true);
    fetch(`/api/vehicles/details?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new ApiError(payload.error?.code ?? "VEHICLE_DETAILS_UNAVAILABLE");
        setManualDetails(payload.data as ManualDetails);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setManualDetails(null);
      })
      .finally(() => { if (!controller.signal.aborted) setManualDetailsLoading(false); });
    return () => controller.abort();
  }, [lookupMode, year, make, model]);

  useEffect(() => {
    if (!imageVehicle) {
      setVehicleImages([]); setSelectedImageIndex(0); setImageLoading(false); setImageSearched(false); return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      year: String(imageVehicle.year),
      make: imageVehicle.make,
      model: imageVehicle.model,
    });
    setVehicleImages([]); setSelectedImageIndex(0); setImageLoading(true); setImageSearched(false);
    fetch(`/api/vehicles/image?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new ApiError(payload.error?.code ?? "IMAGE_LOOKUP_UNAVAILABLE");
        setVehicleImages((payload.data.images ?? []) as VehicleImage[]);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setVehicleImages([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) { setImageLoading(false); setImageSearched(true); }
      });
    return () => controller.abort();
  }, [imageVehicle]);

  async function enrichVinValue(requestedVin: string, requestedLocale: Locale = locale) {
    const requestKey = `${requestedVin}:${requestedLocale}`;
    const cached = enrichmentCache.current.get(requestKey);
    if (cached) { setAiEnrichment(cached); setAiEnrichmentError(""); setAiEnrichmentLoading(false); return; }
    if (enrichmentRequest.current?.key === requestKey) return;
    const requestId = ++enrichmentSequence.current;
    enrichmentRequest.current = { key: requestKey, id: requestId };
    setAiEnrichment(null); setAiEnrichmentError(""); setAiEnrichmentLoading(true);
    try {
      const response = await fetch("/api/vin/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: requestedVin, locale: requestedLocale }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new ApiError(payload.error?.code ?? "GEMINI_UNAVAILABLE");
      const enrichment = payload.data as AiEnrichment;
      enrichmentCache.current.set(requestKey, enrichment);
      if (enrichmentRequest.current?.id === requestId) setAiEnrichment(enrichment);
    } catch (cause) {
      if (enrichmentRequest.current?.id === requestId) {
        const key = cause instanceof ApiError ? `error_${cause.code}` : "error_GEMINI_UNAVAILABLE";
        const translated = translate(requestedLocale, key);
        setAiEnrichmentError(translated === key ? translate(requestedLocale, "error_GEMINI_UNAVAILABLE") : translated);
      }
    } finally {
      if (enrichmentRequest.current?.id === requestId) {
        enrichmentRequest.current = null;
        setAiEnrichmentLoading(false);
      }
    }
  }

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    if (decodedVin) void enrichVinValue(decodedVin, nextLocale);
  }

  async function decodeVinValue(requestedVin: string) {
    setError(""); setDecoded(null); setDecodedVin(""); setMatchNote(""); setAiEnrichment(null); setAiEnrichmentError(""); setVinLoading(true);
    try {
      const body = await fetch("/api/vin/decode", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: requestedVin }),
      });
      const payload = await body.json();
      if (!body.ok || !payload.ok) throw new ApiError(payload.error?.code ?? "VIN_UNAVAILABLE");
      const vehicle = payload.data.decoded as Decoded;
      setDecoded(vehicle);
      setDecodedVin(payload.data.vin);
      void enrichVinValue(payload.data.vin, locale);
      if (!vehicle.year) { setMatchNote(t("noVinYear")); return; }
      const selectedYear = String(vehicle.year);
      const makeItems = (await options("/api/vehicles/makes", { year: selectedYear })).filter((item): item is string => item !== null);
      const matchedMake = findName(makeItems, vehicle.make) ?? "";
      if (!matchedMake) { setMatchNote(t("noLocalMake")); return; }
      const modelItems = (await options("/api/vehicles/models", { year: selectedYear, make: matchedMake })).filter((item): item is string => item !== null);
      const matchedModel = findName(modelItems, vehicle.model) ?? "";
      if (!matchedModel) { setMatchNote(t("noLocalModel")); return; }
      const trimItems = await options("/api/vehicles/trims", { year: selectedYear, make: matchedMake, model: matchedModel });
      const matchedTrim = vehicle.trim
        ? findName(trimItems, vehicle.trim)
        : trimItems.includes(null) ? NONE : null;
      setMatchNote(t(matchedTrim !== null ? "localTrimMatched" : "localModelMatched"));
    } catch (cause) {
      setError(errorText(cause, "error_VIN_UNAVAILABLE"));
    } finally { setVinLoading(false); }
  }

  async function decodeVin(event: FormEvent) {
    event.preventDefault();
    await decodeVinValue(vin);
  }

  async function fillRandomVin() {
    setError("");
    setRandomVinLoading(true);
    try {
      const response = await fetch("/api/vin/random", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new ApiError(payload.error?.code ?? "RANDOM_VIN_UNAVAILABLE");
      }
      setVin(payload.data.vin);
      await decodeVinValue(payload.data.vin);
    } catch (cause) {
      setError(errorText(cause, "error_RANDOM_VIN_UNAVAILABLE"));
    } finally {
      setRandomVinLoading(false);
    }
  }

  const yearOptions = catalog?.years.map((item) => String(item.year)) ?? [];
  const trimOptions = trims.map((item) => item ?? NONE);
  const engineOptions = engines.map((item) => item ?? NONE);
  const vehicleImage = vehicleImages[selectedImageIndex] ?? null;
  const manualDimensions = manualDetails?.dimensions ?? {};
  const activeDecoded = lookupMode === "vin" ? decoded : null;
  const activeResult = lookupMode === "manual" ? result : null;
  const specificationGroups = activeDecoded ? [
    {
      title: t("basicInfo"),
      items: [
        [t("make"), activeDecoded.make], [t("model"), activeDecoded.model], [t("year"), activeDecoded.year],
        [t("trim"), activeDecoded.trim], [t("series"), activeDecoded.series], [t("vehicleType"), activeDecoded.vehicleType],
        [t("body"), activeDecoded.bodyClass], [t("manufacturer"), activeDecoded.manufacturer],
      ],
    },
    {
      title: t("powertrain"),
      items: [
        [t("displacement"), activeDecoded.displacementLiters ? `${activeDecoded.displacementLiters} L` : null],
        [t("cylinders"), activeDecoded.cylinders], [t("engineLayout"), activeDecoded.engineConfiguration],
        [t("engineModel"), activeDecoded.engineModel], [t("horsepower"), activeDecoded.horsepower ? `${activeDecoded.horsepower} hp` : null],
        [t("primaryFuel"), activeDecoded.fuelType], [t("secondaryFuel"), activeDecoded.fuelTypeSecondary],
        [t("electrification"), activeDecoded.electrificationLevel], [t("driveType"), activeDecoded.driveType],
        [t("transmission"), activeDecoded.transmissionStyle], [t("transmissionSpeeds"), activeDecoded.transmissionSpeeds],
      ],
    },
    {
      title: t("bodyManufacturing"),
      items: [
        [t("doors"), activeDecoded.doors], [t("seats"), activeDecoded.seats], [t("brakes"), activeDecoded.brakeSystemType],
        [t("gvwr"), activeDecoded.gvwr], [t("plantCountry"), activeDecoded.plantCountry],
        [t("plantState"), activeDecoded.plantState], [t("plantCity"), activeDecoded.plantCity],
      ],
    },
  ] : activeResult ? [
    {
      title: t("modelInfo"),
      items: [
        [t("make"), activeResult.make], [t("model"), activeResult.model], [t("year"), activeResult.year],
        [t("currentTrim"), activeResult.trim], [t("currentEngine"), activeResult.engine],
        [t("nhtsaRegistration"), manualDetails?.nhtsaModelMatched ? t("nhtsaListed") : null],
        [t("localPaths"), manualDetails?.local.paths], [t("availableTrims"), manualDetails?.local.trims],
        [t("availableEngines"), manualDetails?.local.engines],
      ],
    },
    {
      title: t("dimensions"),
      items: [
        [t("length"), manualDimensions.OL ? `${manualDimensions.OL} cm` : null],
        [t("width"), manualDimensions.OW ? `${manualDimensions.OW} cm` : null],
        [t("height"), manualDimensions.OH ? `${manualDimensions.OH} cm` : null],
        [t("wheelbase"), manualDimensions.WB ? `${manualDimensions.WB} cm` : null],
        [t("curbWeight"), manualDimensions.CW ? `${manualDimensions.CW} kg` : null],
        [t("frontTrack"), manualDimensions.TWF ? `${manualDimensions.TWF} cm` : null],
        [t("rearTrack"), manualDimensions.TWR ? `${manualDimensions.TWR} cm` : null],
        [t("weightDistribution"), manualDimensions.WD],
      ],
    },
    {
      title: t("dataScope"),
      items: [
        [t("vehicleCriteria"), `${activeResult.year} ${activeResult.make} ${activeResult.model}`],
        [t("specSource"), Object.keys(manualDimensions).length ? "NHTSA Canadian Vehicle Specifications" : null],
        [t("configSource"), t("localDb")],
        [t("dataLevel"), t("modelData")],
      ],
    },
  ] : [];
  const showSpecifications = Boolean((lookupMode === "vin" && activeDecoded && decodedVin) || activeResult);
  const specificationYear = imageVehicle?.year ?? (lookupMode === "vin" ? activeDecoded?.year : Number(activeResult?.year) || null);
  const specificationMake = imageVehicle?.make ?? (lookupMode === "vin" ? activeDecoded?.make : activeResult?.make);
  const specificationModel = imageVehicle?.model ?? (lookupMode === "vin" ? activeDecoded?.model : activeResult?.model);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label={t("brand")}><span className="brand-mark">V</span><span>{t("brand")}</span></a>
        <div className="topbar-tools"><div className="language-switcher" aria-label="Language">
          {(["zh", "en", "ja"] as Locale[]).map((item) => <button type="button" className={locale === item ? "active" : ""} onClick={() => changeLocale(item)} aria-pressed={locale === item} key={item}>{item === "zh" ? "中文" : item === "ja" ? "日本語" : "EN"}</button>)}
        </div></div>
      </header>

      <section className="lookup-workspace" id="top">
        <div className="lookup-tabs" role="tablist" aria-label={t("lookupMethods")}>
          <button id="vin-lookup-tab" type="button" role="tab" aria-selected={lookupMode === "vin"} aria-controls="vin-lookup-panel" className={lookupMode === "vin" ? "active" : ""} onClick={() => { setLookupMode("vin"); setError(""); }}>
            <span>01</span><strong>{t("vinTab")}</strong><small>{t("vinTabHint")}</small>
          </button>
          <button id="manual-lookup-tab" type="button" role="tab" aria-selected={lookupMode === "manual"} aria-controls="manual-lookup-panel" className={lookupMode === "manual" ? "active" : ""} onClick={() => { setLookupMode("manual"); setError(""); }}>
            <span>02</span><strong>{t("manualTab")}</strong><small>{t("manualTabHint")}</small>
          </button>
        </div>

        {lookupMode === "vin" ? <section className="hero" id="vin-lookup-panel" role="tabpanel" aria-labelledby="vin-lookup-tab">
          <div className="hero-copy">
            <p className="eyebrow">VEHICLE IDENTITY, RESOLVED</p>
            <h1>One VIN.<br /><em>Zero guesswork.</em></h1>
            <p className="hero-text">{t("heroText")}</p>
            <div className="stats" aria-label={t("statsLabel")}>
              <div><strong>{catalog ? catalog.vehiclePaths.toLocaleString() : "—"}</strong><span>{t("combinations")}</span></div>
              <div><strong>{catalog ? catalog.years.length : "—"}</strong><span>{t("coveredYears")}</span></div>
              <div><strong>5</strong><span>{t("levels")}</span></div>
            </div>
          </div>

          <div className="vin-panel">
            <div className="panel-kicker"><span>VIN</span> {t("vinSmart")}</div>
            <form onSubmit={decodeVin}>
              <label htmlFor="vin">{t("vinLabel")}</label>
              <div className="vin-input-row">
                <input id="vin" value={vin} onChange={(event) => { setVin(event.target.value.toUpperCase()); setDecoded(null); setDecodedVin(""); setAiEnrichment(null); setAiEnrichmentError(""); }} maxLength={17} placeholder={t("vinPlaceholder")} spellCheck={false} />
                <button disabled={vinLoading || randomVinLoading}>{vinLoading ? t("decoding") : t("decode")}</button>
              </div>
            </form>
            <div className="vin-tools">
              <p className="hint">{t("example")}<button type="button" onClick={() => setVin("JTDKN3DU4A0000000")}>JTDKN3DU4A0000000</button></p>
              <button className="random-vin-button" type="button" onClick={fillRandomVin} disabled={randomVinLoading || vinLoading}>
                <span aria-hidden="true">↻</span>{randomVinLoading ? vinLoading ? t("decoding") : t("fetching") : t("random")}
              </button>
            </div>
            {error && <div className="notice error">{error}</div>}
            {decoded && <div className="decode-result">
              <div className="result-heading"><span>{t("nhtsaResult")}</span><b>{matchNote}</b></div>
              <div className="decode-grid"><span>{t("year")}<strong>{decoded.year ?? t("unknown")}</strong></span><span>{t("make")}<strong>{decoded.make ?? t("unknown")}</strong></span><span>{t("model")}<strong>{decoded.model ?? t("unknown")}</strong></span><span>{t("body")}<strong>{decoded.bodyClass ?? t("unknown")}</strong></span></div>
              {aiEnrichmentLoading && <div className="ai-enrichment loading"><span>{t("aiParsing")}</span><p>{t("aiParsingText")}</p></div>}
              {aiEnrichmentError && <div className="ai-enrichment error"><span>{t("aiFailed")}</span><p>{aiEnrichmentError}</p></div>}
              {aiEnrichment && <div className="ai-enrichment">
                <div className="ai-enrichment-heading"><span>{t("aiCandidate")}</span><b>{aiEnrichment.vehicle.status === "inferred" ? t("sourcedInference") : t("unverified")} · {aiEnrichment.vehicle.confidence === "high" ? t("confidenceHigh") : aiEnrichment.vehicle.confidence === "medium" ? t("confidenceMedium") : t("confidenceLow")} {t("confidence")}</b></div>
                <div className="ai-vehicle-grid">
                  <span>{t("year")}<strong>{aiEnrichment.vehicle.modelYear ?? t("cannotDetermine")}</strong></span>
                  <span>{t("make")}<strong>{aiEnrichment.vehicle.make ?? t("cannotDetermine")}</strong></span>
                  <span>{t("model")}<strong>{aiEnrichment.vehicle.model ?? t("cannotDetermine")}</strong></span>
                  <span>{t("manufacturer")}<strong>{aiEnrichment.vehicle.manufacturer ?? t("cannotDetermine")}</strong></span>
                  <span>{t("trim")}<strong>{aiEnrichment.vehicle.trim ?? t("cannotDetermine")}</strong></span>
                  <span>{t("body")}<strong>{aiEnrichment.vehicle.bodyClass ?? t("cannotDetermine")}</strong></span>
                  <span>{t("engine")}<strong>{aiEnrichment.vehicle.engine ?? t("cannotDetermine")}</strong></span>
                  <span>{t("fuel")}<strong>{aiEnrichment.vehicle.fuelType ?? t("cannotDetermine")}</strong></span>
                </div>
                <p className="ai-evidence">{aiEnrichment.vehicle.evidence}</p>
                {aiEnrichment.modelCandidates.length > 0 && <div className="ai-candidates">
                  <div className="ai-candidates-title"><strong>{t("possibleModels")}</strong><span>{t("candidateNotice")}</span></div>
                  <div className="ai-candidate-list">
                    {aiEnrichment.modelCandidates.map((candidate, index) => <article key={`${candidate.make}-${candidate.model}-${index}`}>
                      <div><b>{String(index + 1).padStart(2, "0")}</b><strong>{[candidate.make, candidate.model].filter(Boolean).join(" ")}</strong><span>{t("lowConfidence")}</span></div>
                      <p>{[candidate.modelYear, candidate.platform, candidate.bodyClass].filter(Boolean).join(" · ") || t("noMoreAttributes")}</p>
                      {candidate.possibleTrims.length > 0 && <small>{t("possibleTrims")}{candidate.possibleTrims.join(" / ")}</small>}
                      <em>{candidate.reason}</em>
                    </article>)}
                  </div>
                </div>}
                <small>{aiEnrichment.disclaimer}</small>
              </div>}
            </div>}
          </div>
        </section> : <section className="manual-section" id="manual-lookup-panel" role="tabpanel" aria-labelledby="manual-lookup-tab">
          <div className="section-title"><div><p className="eyebrow">MANUAL LOOKUP</p><h2>{t("manualTitle")}</h2></div><p>{t("manualIntro")}</p></div>
          <div className="finder-card">
            <div className="select-grid">
              <Select label={t("year")} step="01" value={year} disabled={!catalog} onChange={(value) => void chooseYear(value)} options={yearOptions} loading={queryLoading} selectText={t("select")} loadingText={t("loading")} />
              <Select label={t("make")} step="02" value={make} disabled={!makes.length} onChange={(value) => void chooseMake(value)} options={makes} selectText={t("select")} loadingText={t("loading")} />
              <Select label={t("model")} step="03" value={model} disabled={!models.length} onChange={(value) => void chooseModel(value)} options={models} selectText={t("select")} loadingText={t("loading")} />
              <Select label={t("trim")} step="04" value={trim} disabled={!trims.length} onChange={(value) => void chooseTrim(value)} options={trimOptions} nullLabel={t("noTrim")} selectText={t("select")} loadingText={t("loading")} />
              <Select label={t("engine")} step="05" value={engine} disabled={!engines.length} onChange={setEngine} options={engineOptions} nullLabel={t("noEngine")} selectText={t("select")} loadingText={t("loading")} />
            </div>
            {error && <div className="manual-error notice error">{error}</div>}
            {result ? <div className="vehicle-result"><div className="vehicle-icon">✓</div><div><span>{t("currentVehicle")}</span><h3>{result.year} {result.make} {result.model}</h3><p>{[result.trim, result.engine].filter(Boolean).join(" · ") || t("noMoreData")}</p></div><div className="match-badge">{engine ? t("fullMatch") : trim ? t("trimMatch") : t("modelMatch")}</div></div> : <div className="empty-result"><span>→</span> {t("startFromYear")}</div>}
          </div>
        </section>}
      </section>
      {showSpecifications && (
        <section className="specifications-section" aria-labelledby="vehicle-specifications-title">
          <div className="specifications-heading">
            <div><p className="eyebrow">{lookupMode === "vin" ? "NHTSA VEHICLE DATA" : "MODEL SPECIFICATIONS"}</p><h2 id="vehicle-specifications-title">{t("specifications")}</h2></div>
            <span className="nhtsa-source-badge"><i /> {lookupMode === "vin" ? t("nhtsaSource") : t("modelSource")}</span>
          </div>
          <div className="vehicle-image-card" aria-live="polite">
            {imageLoading ? <div className="vehicle-image-placeholder loading"><i /><span>{t("searchingImage")}</span></div> : vehicleImage ? (
              <>
                <div className="vehicle-image-visual">
                  <img src={vehicleImage.imageUrl} alt={`${specificationYear ?? ""} ${specificationMake ?? ""} ${specificationModel ?? ""} ${t("referenceImage")} ${selectedImageIndex + 1}`} loading="lazy" decoding="async" />
                  {vehicleImages.length > 1 && <div className="vehicle-image-gallery" aria-label={t("imageGallery")}>
                    {vehicleImages.map((image, index) => (
                      <button className={index === selectedImageIndex ? "active" : ""} type="button" onClick={() => setSelectedImageIndex(index)} aria-label={`${t("viewImage")} ${index + 1}`} aria-pressed={index === selectedImageIndex} key={image.imageUrl}>
                        <img src={image.imageUrl} alt="" loading="lazy" decoding="async" />
                      </button>
                    ))}
                  </div>}
                </div>
                <div className="vehicle-image-info">
                  <span>{imageVehicle?.inferred ? t("inferredReferenceImage") : t("referenceImage")} · {selectedImageIndex + 1}/{vehicleImages.length}</span>
                  {imageVehicle?.inferred && <div className="inferred-image-notice"><b>AI</b><p>{t("inferredImageNotice")}</p></div>}
                  <strong>{vehicleImage.title}</strong>
                  {vehicleImage.description && <p>{vehicleImage.description}</p>}
                  <div className="vehicle-image-credit">
                    <span>{t("author")}{vehicleImage.artist ?? t("commonsContributor")}</span>
                    {vehicleImage.licenseUrl ? <a href={vehicleImage.licenseUrl} target="_blank" rel="noreferrer">{vehicleImage.license ?? t("viewLicense")}</a> : <span>{vehicleImage.license ?? t("licenseAtSource")}</span>}
                    <a href={vehicleImage.sourceUrl} target="_blank" rel="noreferrer">{t("viewSource")}</a>
                  </div>
                </div>
              </>
            ) : imageSearched ? <div className="vehicle-image-placeholder"><span>{t("noImage")}</span></div> : null}
          </div>
          <div className="specification-identity">
            <div><span>{lookupMode === "vin" ? t("queriedVin") : t("vehicleCriteria")}</span><code>{lookupMode === "vin" ? decodedVin : [activeResult?.year, activeResult?.make, activeResult?.model].filter(Boolean).join(" ")}</code></div>
            <strong>{activeDecoded
              ? [activeDecoded.year, activeDecoded.make, activeDecoded.model, activeDecoded.trim].filter(Boolean).join(" ") || t("noStandardName")
              : [activeResult?.year, activeResult?.make, activeResult?.model, activeResult?.trim].filter(Boolean).join(" ")}</strong>
            <p>{activeDecoded
              ? [activeDecoded.bodyClass, activeDecoded.displacementLiters ? `${activeDecoded.displacementLiters}L` : null, activeDecoded.fuelType].filter(Boolean).join(" · ") || t("noSummary")
              : [activeResult?.engine, manualDetails?.nhtsaModelMatched ? t("nhtsaListed") : null, manualDetailsLoading ? t("loadingSpecs") : null].filter(Boolean).join(" · ") || t("modelReference")}</p>
          </div>
          <div className="specification-groups">
            {specificationGroups.map((group, groupIndex) => (
              <section className="specification-group" key={group.title}>
                <h3><b>{String(groupIndex + 1).padStart(2, "0")}</b>{group.title}</h3>
                <dl>
                  {group.items.map(([label, value]) => (
                    <div className={value === null || value === "" ? "missing" : ""} key={String(label)}>
                      <dt>{label}</dt><dd>{value ?? t("missing")}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="specifications-note">{lookupMode === "vin" ? t("vinSpecsNote") : t("manualSpecsNote")} {t("scopeNote")}</p>
        </section>
      )}
      {patternVehicle && (
        <section className="vin-guide-section">
          <section className="pattern-panel" aria-live="polite">
            <div className="pattern-header">
              <div><p className="eyebrow">VIN FIELD GUIDE</p><h3>{t("vinGuide")}</h3></div>
              {vinPattern && <span className="coverage-badge">{vinPattern.source === "nhtsa" ? t("vinChars") : t("determined")} {vinPattern.knownCharacters}/{vinPattern.totalCharacters}</span>}
            </div>
            {patternLoading && !vinPattern ? <div className="pattern-loading">{t("parsingStructure")}</div> : vinPattern && (
              <>
                <div className="vin-anatomy-heading">
                  <span>{vinPattern.source === "nhtsa" ? t("queriedVinCaption") : t("pseudoVin")}</span>
                  <p>{vinPattern.source === "nhtsa" ? t("allChars") : <><b>*</b> {t("starUnknown")}</>}</p>
                </div>
                <div className="vin-anatomy-scroll">
                  <div className="vin-anatomy" aria-label={`${t("vinDiagram")} ${vinPattern.pattern}`}>
                    <div className="vin-anatomy-labels top" aria-hidden="true">
                      <div className="vin-label range annotation-wmi"><strong>1–3</strong><span>{t("wmi")}</span></div>
                      <div className="vin-label point annotation-check"><strong>9</strong><span>{t("checkDigit")}</span></div>
                      <div className="vin-label point annotation-plant"><strong>11</strong><span>{t("plant")}</span></div>
                      <div className="vin-label range annotation-serial"><strong>12–17</strong><span>{t("serial")}</span></div>
                    </div>
                    <div className="vin-character-row">
                      {vinPattern.pattern.split("").map((character, index) => <div className={character === "*" ? "vin-character unknown" : "vin-character known"} key={`${character}-${index}`}>
                        <small>{index + 1}</small><strong>{character}</strong>
                      </div>)}
                    </div>
                    <div className="vin-anatomy-labels bottom" aria-hidden="true">
                      <div className="vin-label range annotation-vds"><strong>4–8</strong><span>{t("vds")}</span></div>
                      <div className="vin-label point annotation-year"><strong>10</strong><span>{t("modelYear")}</span></div>
                    </div>
                  </div>
                </div>
                <div className="meaning-title"><span>{t("segmentDetails")}</span><p>{vinPattern.source === "nhtsa" ? t("nhtsaSegmentHint") : t("manualSegmentHint")}</p></div>
                <div className="segment-grid">
                  {vinPattern.segments.map((segment) => (
                    <article className={segment.known ? "segment-card known" : "segment-card"} key={segment.key}>
                      <div className="segment-card-top"><span>{segment.positions}</span><b>{vinPattern.source === "nhtsa" ? t("vinProvided") : segment.known ? t("determined") : t("pending")}</b></div>
                      <code>{segment.value}</code>
                      <h4>{segment.name}</h4>
                      <small>{segment.abbreviation}</small>
                      <p>{segment.description}</p>
                      {segment.nhtsaResult && <div className="nhtsa-result"><span>{t("nhtsaQueryResult")}</span><p>{segment.nhtsaResult}</p></div>}
                    </article>
                  ))}
                </div>
                <div className="pattern-disclaimer"><b>!</b><p><strong>{t("important")}</strong>{vinPattern.disclaimer}</p></div>
              </>
            )}
          </section>
        </section>
      )}
      <footer><span>Vehicle Lens</span><p>{t("footer")}</p></footer>
    </main>
  );
}

function Select({ label, step, value, options, disabled, loading, onChange, nullLabel, selectText, loadingText }: { label: string; step: string; value: string; options: string[]; disabled: boolean; loading?: boolean; onChange: (value: string) => void; nullLabel?: string; selectText: string; loadingText: string }) {
  return <label className={disabled ? "select-box disabled" : "select-box"}><span><b>{step}</b>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">{loading ? loadingText : `${selectText}${label}`}</option>{options.map((option, index) => <option key={`${option}-${index}`} value={option}>{option === NONE ? nullLabel : option}</option>)}</select></label>;
}
