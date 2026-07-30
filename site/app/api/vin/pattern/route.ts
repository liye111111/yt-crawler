const MODEL_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

type PatternRequest = {
  locale?: "zh" | "en" | "ja";
  year?: string | number;
  make?: string;
  model?: string;
  trim?: string | null;
  engine?: string | null;
  vin?: string | null;
  decoded?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    displacementLiters?: string | null;
    cylinders?: string | null;
    fuelType?: string | null;
    bodyClass?: string | null;
  } | null;
};

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function details(values: (string | number | null | undefined)[], fallback: string) {
  return values.filter((value) => value !== null && value !== undefined && value !== "").join(" · ") || fallback;
}

function modelYearCode(year: number) {
  if (year < 1980) return null;
  return MODEL_YEAR_CODES[(year - 1980) % MODEL_YEAR_CODES.length];
}

export async function POST(request: Request) {
  let payload: PatternRequest;
  try {
    payload = (await request.json()) as PatternRequest;
  } catch {
    return Response.json(
      { ok: false, error: { code: "INVALID_JSON", message: "请求内容不是有效 JSON" } },
      { status: 400 },
    );
  }

  const year = Number(payload.year);
  const locale = payload.locale === "en" || payload.locale === "ja" ? payload.locale : "zh";
  const copy = {
    zh: { missing: "NHTSA 未返回对应字段", wmi: "世界制造商识别码", wmiDesc: `用于识别制造商、品牌和车辆类型。同一 ${payload.make?.trim() ?? ""} 可能因产地不同使用多个 WMI，当前车型库未包含这项映射。`, brand: "品牌", vds: "车辆描述部分", vdsDesc: "由厂商编码车系、车身、约束系统和发动机等信息，需要对应年份的厂商 VIN 解码规则才能确定。", modelConfig: "车系与配置", power: "动力", cylinders: "缸", check: "校验位", checkDesc: "根据其他16个字符计算，用于检查 VIN 是否有效；在其余位置未知时无法计算。", submitted: "已随完整 VIN 提交给 NHTSA vPIC 解码", yearName: "车型年款代码", yearKnown: (code: string) => `${year} 年对应代码 ${code}。该代码每30年循环一次，因此必须结合完整年份理解。`, yearOld: `${year} 年早于标准17位 VIN 体系，无法按现代规则生成年款代码。`, modelYear: "车型年份", plant: "装配工厂代码", plantDesc: "表示车辆最终装配工厂；同一车型可能由多个工厂生产，需要厂商工厂编码数据。", plantMissing: "NHTSA 当前精简结果未返回装配工厂名称", serial: "车辆生产序列号", serialDesc: "由制造商为每辆具体车辆分配，无法从车型属性推算，也不应生成看似真实的随机序列号。", serialResult: "车辆序列字符来自输入 VIN；NHTSA 不将其解释为车型属性", realDisclaimer: "字符来自用户查询的真实 VIN；各字段说明来自 NHTSA vPIC 查询结果。VIN 字符已知不代表厂商编码含义均已公开。", pseudoDisclaimer: "这是基于已知车型属性生成的 VIN 结构伪码，不代表任何真实车辆，也不能用于识别车辆身份。" },
    en: { missing: "NHTSA did not return this field", wmi: "World Manufacturer Identifier", wmiDesc: `Identifies the manufacturer, make, and vehicle type. ${payload.make?.trim() ?? "This make"} may use multiple WMIs for different production locations; the local model database has no WMI mapping.`, brand: "Make", vds: "Vehicle Descriptor Section", vdsDesc: "Manufacturer-specific codes describe model, body, restraint system, and engine. Decoding requires the manufacturer's rules for that model year.", modelConfig: "Model and trim", power: "Powertrain", cylinders: " cylinders", check: "Check digit", checkDesc: "Calculated from the other 16 characters to validate a VIN; it cannot be calculated while other positions are unknown.", submitted: "Submitted to NHTSA vPIC as part of the complete VIN", yearName: "Model year code", yearKnown: (code: string) => `${year} maps to code ${code}. The code repeats every 30 years and must be interpreted with the full model year.`, yearOld: `${year} predates the standardized 17-character VIN and has no modern model-year code.`, modelYear: "Model year", plant: "Assembly plant code", plantDesc: "Identifies the final assembly plant. A model may be made at multiple plants and requires manufacturer plant-code data.", plantMissing: "The compact NHTSA result did not include an assembly plant", serial: "Vehicle serial number", serialDesc: "Assigned by the manufacturer to an individual vehicle. It cannot be inferred from model attributes and should not be replaced with a realistic-looking random number.", serialResult: "Serial characters come from the submitted VIN; NHTSA does not interpret them as model attributes", realDisclaimer: "Characters come from the queried VIN and descriptions use NHTSA vPIC results. Known characters do not mean every manufacturer code is publicly documented.", pseudoDisclaimer: "This VIN structure pattern is based on known model attributes. It is not a real vehicle VIN and cannot identify a vehicle." },
    ja: { missing: "NHTSAから該当項目が返されませんでした", wmi: "世界製造者識別コード", wmiDesc: `製造者、メーカー、車両タイプを識別します。${payload.make?.trim() ?? "同一メーカー"}でも生産地により複数のWMIを使用する場合があり、ローカル車種DBには対応表がありません。`, brand: "メーカー", vds: "車両記述部", vdsDesc: "メーカー固有コードで車種、ボディ、拘束装置、エンジンなどを表します。特定には年式ごとのメーカーVIN規則が必要です。", modelConfig: "車種・グレード", power: "パワートレイン", cylinders: "気筒", check: "チェック桁", checkDesc: "他の16文字から計算しVINの有効性を確認します。他の位置が不明な場合は計算できません。", submitted: "完全なVINの一部としてNHTSA vPICに送信済み", yearName: "モデル年式コード", yearKnown: (code: string) => `${year}年はコード${code}に対応します。コードは30年周期で繰り返すため、完全な年式と合わせて解釈します。`, yearOld: `${year}年は標準17桁VIN以前のため、現行規則で年式コードを生成できません。`, modelYear: "モデル年式", plant: "組立工場コード", plantDesc: "最終組立工場を示します。同一車種を複数工場で生産する場合があり、メーカーの工場コード資料が必要です。", plantMissing: "NHTSAの簡易結果には組立工場名がありません", serial: "車両製造番号", serialDesc: "メーカーが個々の車両に割り当てます。車種属性から推定できず、実在しそうな乱数で置き換えるべきではありません。", serialResult: "製造番号は入力VIN由来で、NHTSAは車種属性として解釈しません", realDisclaimer: "文字は検索した実VIN由来で、説明はNHTSA vPICの結果に基づきます。文字が既知でもメーカーコードの意味が全て公開されているとは限りません。", pseudoDisclaimer: "既知の車種属性から作ったVIN構造パターンです。実在車両のVINではなく、車両識別には使用できません。" },
  }[locale];
  const make = payload.make?.trim() ?? "";
  const model = payload.model?.trim() ?? "";
  if (!Number.isInteger(year) || !make || !model) {
    return Response.json(
      { ok: false, error: { code: "INVALID_VEHICLE", message: "year、make 和 model 为必填参数" } },
      { status: 400 },
    );
  }

  const yearCode = modelYearCode(year);
  const suppliedVin = payload.vin?.trim().toUpperCase() ?? "";
  const hasDecodedVin = VIN_PATTERN.test(suppliedVin) && Boolean(payload.decoded);
  const decoded = payload.decoded;
  const segments = [
    {
      positions: "1–3",
      value: "***",
      key: "wmi",
      abbreviation: "WMI",
      name: copy.wmi,
      known: false,
      description: copy.wmiDesc,
      nhtsaResult: hasDecodedVin ? `${copy.brand}: ${details([decoded?.make], copy.missing)}` : null,
    },
    {
      positions: "4–8",
      value: "*****",
      key: "vds",
      abbreviation: "VDS",
      name: copy.vds,
      known: false,
      description: copy.vdsDesc,
      nhtsaResult: hasDecodedVin ? `${copy.modelConfig}: ${details([decoded?.model, decoded?.trim, decoded?.bodyClass], copy.missing)}; ${copy.power}: ${details([decoded?.displacementLiters ? `${decoded.displacementLiters}L` : null, decoded?.cylinders ? `${decoded.cylinders}${copy.cylinders}` : null, decoded?.fuelType], copy.missing)}` : null,
    },
    {
      positions: "9",
      value: "*",
      key: "check-digit",
      abbreviation: "Check Digit",
      name: copy.check,
      known: false,
      description: copy.checkDesc,
      nhtsaResult: hasDecodedVin ? copy.submitted : null,
    },
    {
      positions: "10",
      value: yearCode ?? "*",
      key: "model-year",
      abbreviation: "Model Year",
      name: copy.yearName,
      known: yearCode !== null,
      description: yearCode
        ? copy.yearKnown(yearCode)
        : copy.yearOld,
      nhtsaResult: hasDecodedVin ? `${copy.modelYear}: ${details([decoded?.year], copy.missing)}` : null,
    },
    {
      positions: "11",
      value: "*",
      key: "plant",
      abbreviation: "Plant",
      name: copy.plant,
      known: false,
      description: copy.plantDesc,
      nhtsaResult: hasDecodedVin ? copy.plantMissing : null,
    },
    {
      positions: "12–17",
      value: "******",
      key: "serial",
      abbreviation: "VIS / Serial",
      name: copy.serial,
      known: false,
      description: copy.serialDesc,
      nhtsaResult: hasDecodedVin ? copy.serialResult : null,
    },
  ];
  if (hasDecodedVin) {
    const values = [suppliedVin.slice(0, 3), suppliedVin.slice(3, 8), suppliedVin.slice(8, 9), suppliedVin.slice(9, 10), suppliedVin.slice(10, 11), suppliedVin.slice(11, 17)];
    segments.forEach((segment, index) => {
      segment.value = values[index];
      segment.known = true;
    });
  }
  const pattern = segments.map((segment) => segment.value).join("");

  return Response.json({
    ok: true,
    data: {
      pattern,
      knownCharacters: hasDecodedVin ? 17 : yearCode ? 1 : 0,
      totalCharacters: 17,
      source: hasDecodedVin ? "nhtsa" : "vehicle-selection",
      selectedVehicle: {
        year,
        make,
        model,
        trim: payload.trim?.trim() || null,
        engine: payload.engine?.trim() || null,
      },
      segments,
      disclaimer: hasDecodedVin ? copy.realDisclaimer : copy.pseudoDisclaimer,
    },
  });
}
