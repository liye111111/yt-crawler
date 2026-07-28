"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

const NONE = "__none__";
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
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "车型查询失败");
  return body.data as T;
}

async function options(path: string, params: Record<string, string>) {
  return (await api<{ items: (string | null)[] }>(path, params)).items;
}

export function VehicleFinder() {
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
  const [vinPattern, setVinPattern] = useState<VinPattern | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [vehicleImages, setVehicleImages] = useState<VehicleImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageSearched, setImageSearched] = useState(false);
  const [manualDetails, setManualDetails] = useState<ManualDetails | null>(null);
  const [manualDetailsLoading, setManualDetailsLoading] = useState(false);

  useEffect(() => {
    api<Catalog>("/api/vehicles/catalog")
      .then(setCatalog)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "车型数据库加载失败"));
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "品牌加载失败"); return []; }
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

  const patternVehicle = useMemo(() => result ?? (
    decodedVin && decoded?.year && decoded.make && decoded.model
      ? { year: String(decoded.year), make: decoded.make, model: decoded.model, trim: decoded.trim, engine: null }
      : null
  ), [result, decodedVin, decoded]);

  function clearNhtsaResult() {
    setDecoded(null);
    setDecodedVin("");
    setMatchNote("");
  }

  useEffect(() => {
    if (!patternVehicle) { setVinPattern(null); setPatternLoading(false); return; }
    const controller = new AbortController();
    setVinPattern(null);
    setPatternLoading(true);
    fetch("/api/vin/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patternVehicle, vin: decodedVin || null, decoded: decodedVin ? decoded : null }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "VIN 伪码生成失败");
        setVinPattern(payload.data as VinPattern);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message);
      })
      .finally(() => { if (!controller.signal.aborted) setPatternLoading(false); });
    return () => controller.abort();
  }, [patternVehicle, decodedVin, decoded]);

  useEffect(() => {
    if (decodedVin || vinLoading || !year || !make || !model) {
      setManualDetails(null); setManualDetailsLoading(false); return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ year, make, model });
    setManualDetails(null); setManualDetailsLoading(true);
    fetch(`/api/vehicles/details?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "车型详情加载失败");
        setManualDetails(payload.data as ManualDetails);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setManualDetails(null);
      })
      .finally(() => { if (!controller.signal.aborted) setManualDetailsLoading(false); });
    return () => controller.abort();
  }, [year, make, model, decodedVin, vinLoading]);

  useEffect(() => {
    const imageYear = decodedVin ? decoded?.year : Number(year) || null;
    const imageMake = decodedVin ? decoded?.make : make;
    const imageModel = decodedVin ? decoded?.model : model;
    if (!imageYear || !imageMake || !imageModel) {
      setVehicleImages([]); setSelectedImageIndex(0); setImageLoading(false); setImageSearched(false); return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      year: String(imageYear),
      make: imageMake,
      model: imageModel,
    });
    setVehicleImages([]); setSelectedImageIndex(0); setImageLoading(true); setImageSearched(false);
    fetch(`/api/vehicles/image?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "图片查询失败");
        setVehicleImages((payload.data.images ?? []) as VehicleImage[]);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError") setVehicleImages([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) { setImageLoading(false); setImageSearched(true); }
      });
    return () => controller.abort();
  }, [decodedVin, decoded?.year, decoded?.make, decoded?.model, year, make, model]);

  async function decodeVinValue(requestedVin: string) {
    setError(""); setDecoded(null); setDecodedVin(""); setMatchNote(""); setVinLoading(true);
    try {
      const body = await fetch("/api/vin/decode", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: requestedVin }),
      });
      const payload = await body.json();
      if (!body.ok || !payload.ok) throw new Error(payload.error?.message ?? "VIN 解析失败");
      const vehicle = payload.data.decoded as Decoded;
      setDecoded(vehicle);
      setDecodedVin(payload.data.vin);
      if (!vehicle.year) { setMatchNote("VIN 未返回有效年份，请使用手动查询。"); return; }
      const selectedYear = String(vehicle.year);
      const makeItems = await chooseYear(selectedYear);
      const matchedMake = findName(makeItems, vehicle.make) ?? "";
      if (!matchedMake) { setMatchNote("已识别年份，但本地库没有对应品牌。"); return; }
      const modelItems = await chooseMake(matchedMake, selectedYear);
      const matchedModel = findName(modelItems, vehicle.model) ?? "";
      if (!matchedModel) { setMatchNote("已匹配到品牌，请手动确认车系。"); return; }
      const trimItems = await chooseModel(matchedModel, selectedYear, matchedMake);
      const matchedTrim = vehicle.trim
        ? findName(trimItems, vehicle.trim)
        : trimItems.includes(null) ? NONE : null;
      if (matchedTrim !== null) await chooseTrim(matchedTrim, selectedYear, matchedMake, matchedModel);
      const level = matchedTrim !== null ? "配置款" : "车系";
      setMatchNote(`已自动匹配到${level}，你可以继续确认下方候选项。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "VIN 解析失败");
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
        throw new Error(payload.error?.message ?? "随机 VIN 获取失败");
      }
      setVin(payload.data.vin);
      await decodeVinValue(payload.data.vin);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "请求失败";
      setError(`无法获取随机 VIN：${detail}`);
    } finally {
      setRandomVinLoading(false);
    }
  }

  const yearOptions = catalog?.years.map((item) => String(item.year)) ?? [];
  const trimOptions = trims.map((item) => item ?? NONE);
  const engineOptions = engines.map((item) => item ?? NONE);
  const vehicleImage = vehicleImages[selectedImageIndex] ?? null;
  const manualDimensions = manualDetails?.dimensions ?? {};
  const specificationGroups = decoded ? [
    {
      title: "基本信息",
      items: [
        ["品牌", decoded.make], ["车系", decoded.model], ["年款", decoded.year],
        ["配置款", decoded.trim], ["系列", decoded.series], ["车辆类型", decoded.vehicleType],
        ["车身类型", decoded.bodyClass], ["制造商", decoded.manufacturer],
      ],
    },
    {
      title: "动力与传动",
      items: [
        ["排量", decoded.displacementLiters ? `${decoded.displacementLiters} L` : null],
        ["气缸数", decoded.cylinders], ["发动机布局", decoded.engineConfiguration],
        ["发动机型号", decoded.engineModel], ["发动机功率", decoded.horsepower ? `${decoded.horsepower} hp` : null],
        ["主要燃料", decoded.fuelType], ["辅助燃料", decoded.fuelTypeSecondary],
        ["电气化类型", decoded.electrificationLevel], ["驱动形式", decoded.driveType],
        ["变速器", decoded.transmissionStyle], ["变速器挡位", decoded.transmissionSpeeds],
      ],
    },
    {
      title: "车身与制造",
      items: [
        ["车门数", decoded.doors], ["座位数", decoded.seats], ["制动系统", decoded.brakeSystemType],
        ["总质量等级", decoded.gvwr], ["生产国家", decoded.plantCountry],
        ["生产州/省", decoded.plantState], ["生产城市", decoded.plantCity],
      ],
    },
  ] : result ? [
    {
      title: "车型信息",
      items: [
        ["品牌", result.make], ["车系", result.model], ["年款", result.year],
        ["当前配置款", result.trim], ["当前发动机", result.engine],
        ["NHTSA 车型登记", manualDetails?.nhtsaModelMatched ? "已找到对应车型" : null],
        ["本地车型组合", manualDetails?.local.paths], ["可选配置款", manualDetails?.local.trims],
        ["可选发动机", manualDetails?.local.engines],
      ],
    },
    {
      title: "尺寸与重量",
      items: [
        ["车长", manualDimensions.OL ? `${manualDimensions.OL} cm` : null],
        ["车宽", manualDimensions.OW ? `${manualDimensions.OW} cm` : null],
        ["车高", manualDimensions.OH ? `${manualDimensions.OH} cm` : null],
        ["轴距", manualDimensions.WB ? `${manualDimensions.WB} cm` : null],
        ["整备质量", manualDimensions.CW ? `${manualDimensions.CW} kg` : null],
        ["前轮距", manualDimensions.TWF ? `${manualDimensions.TWF} cm` : null],
        ["后轮距", manualDimensions.TWR ? `${manualDimensions.TWR} cm` : null],
        ["前后配重", manualDimensions.WD],
      ],
    },
    {
      title: "数据范围",
      items: [
        ["车型条件", `${result.year} ${result.make} ${result.model}`],
        ["规格来源", Object.keys(manualDimensions).length ? "NHTSA Canadian Vehicle Specifications" : null],
        ["配置来源", "本地五级车型数据库"],
        ["数据级别", "车型级参考数据"],
      ],
    },
  ] : [];
  const showSpecifications = Boolean((decoded && decodedVin) || result);
  const specificationYear = decodedVin ? decoded?.year : Number(result?.year) || null;
  const specificationMake = decodedVin ? decoded?.make : result?.make;
  const specificationModel = decodedVin ? decoded?.model : result?.model;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="车鉴首页"><span className="brand-mark">V</span><span>车鉴 · Vehicle Lens</span></a>
        <span className="data-pill"><i /> 本地 D1 · 数据更新至 2026-07-27</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">VEHICLE IDENTITY, RESOLVED</p>
          <h1>One VIN.<br /><em>Zero guesswork.</em></h1>
          <p className="hero-text">结合 NHTSA VIN 解码与五级车型数据库，快速定位年款、品牌、车系、配置款和发动机。</p>
          <div className="stats" aria-label="数据库概览">
            <div><strong>{catalog ? catalog.vehiclePaths.toLocaleString() : "—"}</strong><span>车型组合</span></div>
            <div><strong>{catalog ? catalog.years.length : "—"}</strong><span>覆盖年份</span></div>
            <div><strong>5</strong><span>属性层级</span></div>
          </div>
        </div>

        <div className="vin-panel">
          <div className="panel-kicker"><span>01</span> VIN 智能识别</div>
          <form onSubmit={decodeVin}>
            <label htmlFor="vin">输入17位车辆识别码</label>
            <div className="vin-input-row">
              <input id="vin" value={vin} onChange={(event) => { setVin(event.target.value.toUpperCase()); setDecoded(null); setDecodedVin(""); }} maxLength={17} placeholder="例如 JTDKN3DU4A0000000" spellCheck={false} />
              <button disabled={vinLoading || randomVinLoading}>{vinLoading ? "识别中…" : "解析 VIN"}</button>
            </div>
          </form>
          <div className="vin-tools">
            <p className="hint">试试示例：<button type="button" onClick={() => setVin("JTDKN3DU4A0000000")}>JTDKN3DU4A0000000</button></p>
            <button className="random-vin-button" type="button" onClick={fillRandomVin} disabled={randomVinLoading || vinLoading}>
              <span aria-hidden="true">↻</span>{randomVinLoading ? vinLoading ? "解析中…" : "获取中…" : "随机 VIN"}
            </button>
          </div>
          {error && <div className="notice error">{error}</div>}
          {decoded && <div className="decode-result"><div className="result-heading"><span>解码结果</span><b>{matchNote}</b></div><div className="decode-grid"><span>年份<strong>{decoded.year ?? "未知"}</strong></span><span>品牌<strong>{decoded.make ?? "未知"}</strong></span><span>车系<strong>{decoded.model ?? "未知"}</strong></span><span>车身<strong>{decoded.bodyClass ?? "未知"}</strong></span></div></div>}
        </div>
      </section>

      <section className="manual-section">
        <div className="section-title"><div><p className="eyebrow">MANUAL LOOKUP</p><h2>手动车型查询</h2></div><p>不知道 VIN？按顺序选择车辆属性。</p></div>
        <div className="finder-card">
          <div className="select-grid">
            <Select label="年款" step="01" value={year} disabled={!catalog} onChange={(value) => { clearNhtsaResult(); void chooseYear(value); }} options={yearOptions} loading={queryLoading} />
            <Select label="品牌" step="02" value={make} disabled={!makes.length} onChange={(value) => { clearNhtsaResult(); void chooseMake(value); }} options={makes} />
            <Select label="车系" step="03" value={model} disabled={!models.length} onChange={(value) => { clearNhtsaResult(); void chooseModel(value); }} options={models} />
            <Select label="配置款" step="04" value={trim} disabled={!trims.length} onChange={(value) => void chooseTrim(value)} options={trimOptions} nullLabel="无配置款" />
            <Select label="发动机" step="05" value={engine} disabled={!engines.length} onChange={setEngine} options={engineOptions} nullLabel="未提供发动机" />
          </div>
          {result ? <div className="vehicle-result"><div className="vehicle-icon">✓</div><div><span>当前车型</span><h3>{result.year} {result.make} {result.model}</h3><p>{[result.trim, result.engine].filter(Boolean).join(" · ") || "该车型没有更多配置数据"}</p></div><div className="match-badge">{engine ? "完整匹配" : trim ? "配置款匹配" : "车系匹配"}</div></div> : <div className="empty-result"><span>→</span> 从年款开始，逐级缩小车型范围</div>}
        </div>
      </section>
      {showSpecifications && (
        <section className="specifications-section" aria-labelledby="vehicle-specifications-title">
          <div className="specifications-heading">
            <div><p className="eyebrow">{decodedVin ? "NHTSA VEHICLE DATA" : "MODEL SPECIFICATIONS"}</p><h2 id="vehicle-specifications-title">车辆规格详情</h2></div>
            <span className="nhtsa-source-badge"><i /> {decodedVin ? "数据来源 · NHTSA vPIC" : "车型级资料 · D1 + NHTSA CVS"}</span>
          </div>
          <div className="vehicle-image-card" aria-live="polite">
            {imageLoading ? <div className="vehicle-image-placeholder loading"><i /><span>正在异步查找同款车型参考图…</span></div> : vehicleImage ? (
              <>
                <div className="vehicle-image-visual">
                  <img src={vehicleImage.imageUrl} alt={`${specificationYear ?? ""} ${specificationMake ?? ""} ${specificationModel ?? ""} 同款车型参考图 ${selectedImageIndex + 1}`} loading="lazy" decoding="async" />
                  {vehicleImages.length > 1 && <div className="vehicle-image-gallery" aria-label="车型参考图片画廊">
                    {vehicleImages.map((image, index) => (
                      <button className={index === selectedImageIndex ? "active" : ""} type="button" onClick={() => setSelectedImageIndex(index)} aria-label={`查看第 ${index + 1} 张车型参考图`} aria-pressed={index === selectedImageIndex} key={image.imageUrl}>
                        <img src={image.imageUrl} alt="" loading="lazy" decoding="async" />
                      </button>
                    ))}
                  </div>}
                </div>
                <div className="vehicle-image-info">
                  <span>同款车型参考图 · {selectedImageIndex + 1}/{vehicleImages.length}</span>
                  <strong>{vehicleImage.title}</strong>
                  {vehicleImage.description && <p>{vehicleImage.description}</p>}
                  <div className="vehicle-image-credit">
                    <span>作者：{vehicleImage.artist ?? "Wikimedia Commons 贡献者"}</span>
                    {vehicleImage.licenseUrl ? <a href={vehicleImage.licenseUrl} target="_blank" rel="noreferrer">{vehicleImage.license ?? "查看授权"}</a> : <span>{vehicleImage.license ?? "授权信息见来源页"}</span>}
                    <a href={vehicleImage.sourceUrl} target="_blank" rel="noreferrer">查看图片来源 ↗</a>
                  </div>
                </div>
              </>
            ) : imageSearched ? <div className="vehicle-image-placeholder"><span>Wikimedia Commons 暂未找到可靠的同款车型参考图</span></div> : null}
          </div>
          <div className="specification-identity">
            <div><span>{decodedVin ? "查询 VIN" : "车型条件"}</span><code>{decodedVin || [result?.year, result?.make, result?.model].filter(Boolean).join(" ")}</code></div>
            <strong>{decoded
              ? [decoded.year, decoded.make, decoded.model, decoded.trim].filter(Boolean).join(" ") || "NHTSA 未返回标准车型名称"
              : [result?.year, result?.make, result?.model, result?.trim].filter(Boolean).join(" ")}</strong>
            <p>{decoded
              ? [decoded.bodyClass, decoded.displacementLiters ? `${decoded.displacementLiters}L` : null, decoded.fuelType].filter(Boolean).join(" · ") || "暂无车辆摘要"
              : [result?.engine, manualDetails?.nhtsaModelMatched ? "NHTSA 已收录" : null, manualDetailsLoading ? "正在异步加载车型规格…" : null].filter(Boolean).join(" · ") || "车型级参考资料"}</p>
          </div>
          <div className="specification-groups">
            {specificationGroups.map((group, groupIndex) => (
              <section className="specification-group" key={group.title}>
                <h3><b>{String(groupIndex + 1).padStart(2, "0")}</b>{group.title}</h3>
                <dl>
                  {group.items.map(([label, value]) => (
                    <div className={value === null || value === "" ? "missing" : ""} key={String(label)}>
                      <dt>{label}</dt><dd>{value ?? "未提供"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="specifications-note">{decodedVin
            ? "该区域仅展示 NHTSA vPIC 对当前 VIN 返回的字段；“未提供”表示接口没有返回可靠值。"
            : "该区域基于年款、品牌和车系异步查询车型级资料；尺寸来自 NHTSA Canadian Vehicle Specifications，配置统计来自本地 D1。没有真实 VIN 时无法确定工厂、具体驱动和车辆序列信息。"} 车辆图片、市场价格和具体在售配置不属于 vPIC 数据。</p>
        </section>
      )}
      {patternVehicle && (
        <section className="vin-guide-section">
          <section className="pattern-panel" aria-live="polite">
            <div className="pattern-header">
              <div><p className="eyebrow">VIN FIELD GUIDE</p><h3>VIN 字段说明</h3></div>
              {vinPattern && <span className="coverage-badge">{vinPattern.source === "nhtsa" ? "VIN 字符" : "已确定"} {vinPattern.knownCharacters}/{vinPattern.totalCharacters} 位</span>}
            </div>
            {patternLoading && !vinPattern ? <div className="pattern-loading">正在解析 VIN 结构…</div> : vinPattern && (
              <>
                <div className="pattern-code-block">
                  <span className="pattern-caption">{vinPattern.source === "nhtsa" ? "NHTSA 查询 VIN" : "17位结构伪码"}</span>
                  <strong>{vinPattern.pattern}</strong>
                  <p>{vinPattern.source === "nhtsa" ? "完整字符来自本次 VIN 查询" : <><b>*</b> 代表当前数据无法确定的字符</>}</p>
                </div>
                <div className="pattern-sequence" aria-label={`VIN 伪码 ${vinPattern.pattern}`}>
                  {vinPattern.segments.map((segment) => (
                    <div className={segment.known ? "pattern-chunk known" : "pattern-chunk"} key={segment.key}>
                      <span>{segment.positions} 位</span><strong>{segment.value}</strong><small>{segment.abbreviation}</small>
                    </div>
                  ))}
                </div>
                <div className="meaning-title"><span>分段说明</span><p>{vinPattern.source === "nhtsa" ? "以下明确列出 NHTSA vPIC 返回的车型信息。" : "VIN 每一段由不同规则生成，不能仅凭车型名称反向推算。"}</p></div>
                <div className="segment-grid">
                  {vinPattern.segments.map((segment) => (
                    <article className={segment.known ? "segment-card known" : "segment-card"} key={segment.key}>
                      <div className="segment-card-top"><span>{segment.positions} 位</span><b>{vinPattern.source === "nhtsa" ? "VIN 已提供" : segment.known ? "已确定" : "待补充"}</b></div>
                      <code>{segment.value}</code>
                      <h4>{segment.name}</h4>
                      <small>{segment.abbreviation}</small>
                      <p>{segment.description}</p>
                      {segment.nhtsaResult && <div className="nhtsa-result"><span>NHTSA 查询结果</span><p>{segment.nhtsaResult}</p></div>}
                    </article>
                  ))}
                </div>
                <div className="pattern-disclaimer"><b>!</b><p><strong>重要说明</strong>{vinPattern.disclaimer}</p></div>
              </>
            )}
          </section>
        </section>
      )}
      <footer><span>Vehicle Lens POC</span><p>VIN 数据来自 NHTSA vPIC；查询结果仅供车型识别参考。</p></footer>
    </main>
  );
}

function Select({ label, step, value, options, disabled, loading, onChange, nullLabel }: { label: string; step: string; value: string; options: string[]; disabled: boolean; loading?: boolean; onChange: (value: string) => void; nullLabel?: string }) {
  return <label className={disabled ? "select-box disabled" : "select-box"}><span><b>{step}</b>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">{loading ? "加载中…" : `请选择${label}`}</option>{options.map((option, index) => <option key={`${option}-${index}`} value={option}>{option === NONE ? nullLabel : option}</option>)}</select></label>;
}
