const MODEL_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

type PatternRequest = {
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

function details(values: (string | number | null | undefined)[]) {
  return values.filter((value) => value !== null && value !== undefined && value !== "").join(" · ") || "NHTSA 未返回对应字段";
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
      name: "世界制造商识别码",
      known: false,
      description: `用于识别制造商、品牌和车辆类型。同一 ${make} 可能因产地不同使用多个 WMI，当前车型库未包含这项映射。`,
      nhtsaResult: hasDecodedVin ? `品牌：${details([decoded?.make])}` : null,
    },
    {
      positions: "4–8",
      value: "*****",
      key: "vds",
      abbreviation: "VDS",
      name: "车辆描述部分",
      known: false,
      description: "由厂商编码车系、车身、约束系统和发动机等信息，需要对应年份的厂商 VIN 解码规则才能确定。",
      nhtsaResult: hasDecodedVin ? `车系与配置：${details([decoded?.model, decoded?.trim, decoded?.bodyClass])}；动力：${details([decoded?.displacementLiters ? `${decoded.displacementLiters}L` : null, decoded?.cylinders ? `${decoded.cylinders}缸` : null, decoded?.fuelType])}` : null,
    },
    {
      positions: "9",
      value: "*",
      key: "check-digit",
      abbreviation: "Check Digit",
      name: "校验位",
      known: false,
      description: "根据其他16个字符计算，用于检查 VIN 是否有效；在其余位置未知时无法计算。",
      nhtsaResult: hasDecodedVin ? "已随完整 VIN 提交给 NHTSA vPIC 解码" : null,
    },
    {
      positions: "10",
      value: yearCode ?? "*",
      key: "model-year",
      abbreviation: "Model Year",
      name: "车型年款代码",
      known: yearCode !== null,
      description: yearCode
        ? `${year} 年对应代码 ${yearCode}。该代码每30年循环一次，因此必须结合完整年份理解。`
        : `${year} 年早于标准17位 VIN 体系，无法按现代规则生成年款代码。`,
      nhtsaResult: hasDecodedVin ? `车型年份：${details([decoded?.year])}` : null,
    },
    {
      positions: "11",
      value: "*",
      key: "plant",
      abbreviation: "Plant",
      name: "装配工厂代码",
      known: false,
      description: "表示车辆最终装配工厂；同一车型可能由多个工厂生产，需要厂商工厂编码数据。",
      nhtsaResult: hasDecodedVin ? "NHTSA 当前精简结果未返回装配工厂名称" : null,
    },
    {
      positions: "12–17",
      value: "******",
      key: "serial",
      abbreviation: "VIS / Serial",
      name: "车辆生产序列号",
      known: false,
      description: "由制造商为每辆具体车辆分配，无法从车型属性推算，也不应生成看似真实的随机序列号。",
      nhtsaResult: hasDecodedVin ? "车辆序列字符来自输入 VIN；NHTSA 不将其解释为车型属性" : null,
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
      disclaimer: hasDecodedVin
        ? "字符来自用户查询的真实 VIN；各字段说明来自 NHTSA vPIC 查询结果。VIN 字符已知不代表厂商编码含义均已公开。"
        : "这是基于已知车型属性生成的 VIN 结构伪码，不代表任何真实车辆，也不能用于识别车辆身份。",
    },
  });
}
