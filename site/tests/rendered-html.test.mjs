import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("implements the vehicle finder without starter artifacts", async () => {
  const [page, finder, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/VehicleFinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<VehicleFinder \/>/);
  assert.match(finder, /手动车型查询/);
  assert.match(finder, /One VIN\./);
  assert.match(finder, /Zero guesswork\./);
  assert.match(finder, /\/api\/vehicles\/catalog/);
  assert.match(finder, /\/api\/vin\/decode/);
  assert.match(finder, /\/api\/vin\/random/);
  assert.match(finder, /随机 VIN/);
  assert.match(finder, /await decodeVinValue\(payload\.data\.vin\)/);
  assert.match(finder, /\/api\/vin\/pattern/);
  assert.match(finder, /VIN 字段说明/);
  assert.match(finder, /label="配置款"[\s\S]*?onChange=\{\(value\) => void chooseTrim\(value\)\}/);
  assert.match(finder, /label="发动机"[\s\S]*?onChange=\{setEngine\}/);
  assert.match(finder, /分段说明/);
  assert.match(finder, /NHTSA 查询结果/);
  assert.match(finder, /VIN 字符/);
  assert.match(finder, /车辆规格详情/);
  assert.match(finder, /数据来源 · NHTSA vPIC/);
  assert.ok(finder.indexOf("车辆规格详情") < finder.indexOf("VIN 字段说明"));
  assert.match(finder, /\/api\/vehicles\/image/);
  assert.match(finder, /\/api\/vehicles\/details/);
  assert.match(finder, /车型级资料 · D1 \+ NHTSA CVS/);
  assert.match(finder, /正在异步加载车型规格/);
  assert.match(finder, /正在异步查找同款车型参考图/);
  assert.match(finder, /loading="lazy"/);
  assert.match(finder, /车型参考图片画廊/);
  assert.match(layout, /车鉴 Vehicle Lens/);
  assert.doesNotMatch(`${page}${finder}${layout}${packageJson}`, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("loads model-level specifications after manual model selection", async () => {
  const route = await readFile(new URL("../app/api/vehicles/details/route.ts", import.meta.url), "utf8");
  assert.match(route, /GetCanadianVehicleSpecifications/);
  assert.match(route, /GetModelsForMakeYear/);
  assert.match(route, /COUNT\(DISTINCT trim\)/);
  assert.match(route, /COUNT\(DISTINCT engine\)/);
  assert.match(route, /setTimeout\(\(\) => controller\.abort\(\), 7_000\)/);
});

test("loads licensed vehicle reference images through Wikimedia Commons", async () => {
  const route = await readFile(new URL("../app/api/vehicles/image/route.ts", import.meta.url), "utf8");
  assert.match(route, /https:\/\/commons\.wikimedia\.org\/w\/api\.php/);
  assert.match(route, /gsrnamespace: "6"/);
  assert.match(route, /LicenseShortName\|LicenseUrl/);
  assert.match(route, /AbortSignal\.timeout\(8_000\)/);
  assert.match(route, /hostname\.endsWith\("wikimedia\.org"\)/);
  assert.match(route, /if \(images\.length === 5\) break/);
});

test("proxies and validates RandomVIN through the Worker", async () => {
  const route = await readFile(new URL("../app/api/vin/random/route.ts", import.meta.url), "utf8");
  const validation = route.indexOf("VIN_PATTERN.test");
  const response = route.indexOf("Response.json", validation);
  assert.match(route, /https:\/\/randomvin\.com\/getvin\.php\?type=real/);
  assert.match(route, /AbortSignal\.timeout\(8_000\)/);
  assert.match(route, /\^\[A-HJ-NPR-Z0-9\]\{17\}\$/);
  assert.ok(validation >= 0 && response > validation);
});

test("builds a 17-character VIN pattern and explains every segment", async () => {
  const route = await readFile(new URL("../app/api/vin/pattern/route.ts", import.meta.url), "utf8");
  assert.match(route, /MODEL_YEAR_CODES/);
  assert.match(route, /世界制造商识别码/);
  assert.match(route, /车辆描述部分/);
  assert.match(route, /校验位/);
  assert.match(route, /车型年款代码/);
  assert.match(route, /装配工厂代码/);
  assert.match(route, /车辆生产序列号/);
  assert.match(route, /不代表任何真实车辆/);
  assert.match(route, /source: hasDecodedVin \? "nhtsa"/);
  assert.match(route, /NHTSA 当前精简结果/);
});

test("validates VIN before calling vPIC", async () => {
  const route = await readFile(new URL("../app/api/vin/decode/route.ts", import.meta.url), "utf8");
  const validation = route.indexOf("VIN_PATTERN.test");
  const upstream = route.indexOf("vpic.nhtsa.dot.gov");
  assert.ok(validation >= 0 && upstream > validation);
  assert.match(route, /\^\[A-HJ-NPR-Z0-9\]\{17\}\$/);
  assert.match(route, /transmissionStyle: text\(result\.TransmissionStyle\)/);
  assert.match(route, /plantCountry: text\(result\.PlantCountry\)/);
});

test("declares the D1 schema and generated migration", async () => {
  const [hosting, migration] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_next_power_man.sql", import.meta.url), "utf8"),
  ]);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(migration, /CREATE TABLE `vehicle_paths`/);
  assert.match(migration, /vehicle_paths_year_make_model_idx/);
  assert.match(migration, /vehicle_paths_path_key_uq/);
});

test("provides an environment-driven Cloudflare deployment workflow", async () => {
  const [example, renderer, packageJson, viteConfig] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../scripts/render-wrangler-config.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(example, /CLOUDFLARE_ACCOUNT_ID=/);
  assert.match(example, /CF_D1_DATABASE_ID=/);
  assert.match(renderer, /database_id: process\.env\.CF_D1_DATABASE_ID/);
  assert.match(renderer, /binding: "DB"/);
  assert.match(renderer, /compatibility_date: "2026-05-22"/);
  assert.match(packageJson, /"cf:deploy"/);
  assert.match(packageJson, /CF_WORKER_DEPLOY=1 vinext deploy/);
  assert.match(viteConfig, /configPath: isCloudflareDeploy \? "\.\/wrangler\.jsonc" : "\.\/wrangler\.local\.jsonc"/);
  assert.doesNotMatch(viteConfig, /config: localBindingConfig/);
  assert.doesNotMatch(renderer, /CLOUDFLARE_API_TOKEN.*[A-Za-z0-9_-]{20}/);
});
