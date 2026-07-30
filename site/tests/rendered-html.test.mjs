import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("implements the vehicle finder without starter artifacts", async () => {
  const [page, finder, i18n, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/VehicleFinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const localizedUi = `${finder}\n${i18n}`;
  assert.match(page, /<VehicleFinder \/>/);
  assert.match(localizedUi, /手动车型查询/);
  assert.match(finder, /role="tablist"/);
  assert.match(finder, /role="tab"/);
  assert.match(finder, /aria-controls="vin-lookup-panel"/);
  assert.match(finder, /aria-controls="manual-lookup-panel"/);
  assert.match(finder, /lookupMode === "vin"/);
  assert.match(finder, /One VIN\./);
  assert.match(finder, /Zero guesswork\./);
  assert.match(finder, /\/api\/vehicles\/catalog/);
  assert.match(finder, /\/api\/vin\/decode/);
  assert.match(finder, /\/api\/vin\/enrich/);
  assert.match(localizedUi, /AI 候选车型/);
  assert.match(localizedUi, /可能的车系/);
  assert.match(finder, /\/api\/vin\/random/);
  assert.match(localizedUi, /随机 VIN/);
  assert.match(finder, /await decodeVinValue\(payload\.data\.vin\)/);
  assert.doesNotMatch(finder, /const makeItems = await chooseYear\(selectedYear\)/);
  assert.match(finder, /\/api\/vin\/pattern/);
  assert.match(localizedUi, /VIN 字段说明/);
  assert.match(finder, /label=\{t\("trim"\)\}[\s\S]*?onChange=\{\(value\) => void chooseTrim\(value\)\}/);
  assert.match(finder, /label=\{t\("engine"\)\}[\s\S]*?onChange=\{setEngine\}/);
  assert.match(localizedUi, /分段说明/);
  assert.match(finder, /vin-anatomy/);
  assert.match(finder, /vinPattern\.pattern\.split\(""\)/);
  assert.match(localizedUi, /WMI 制造商/);
  assert.match(localizedUi, /VDS 车辆特征/);
  assert.match(localizedUi, /生产序列号/);
  assert.match(localizedUi, /NHTSA 查询结果/);
  assert.match(localizedUi, /VIN 字符/);
  assert.match(localizedUi, /车辆规格详情/);
  assert.match(localizedUi, /数据来源 · NHTSA vPIC/);
  assert.ok(finder.indexOf('t("specifications")') < finder.indexOf('t("vinGuide")'));
  assert.match(finder, /\/api\/vehicles\/image/);
  assert.match(finder, /aiEnrichment\?\.modelCandidates\[0\]/);
  assert.match(finder, /inferred: !decoded\?\.model/);
  assert.match(localizedUi, /AI 推测车型参考图/);
  assert.match(localizedUi, /does not confirm the VIN’s model/);
  assert.match(finder, /\/api\/vehicles\/details/);
  assert.match(localizedUi, /车型级资料 · D1 \+ NHTSA CVS/);
  assert.match(localizedUi, /正在异步加载车型规格/);
  assert.match(localizedUi, /正在异步查找同款车型参考图/);
  assert.match(finder, /loading="lazy"/);
  assert.match(localizedUi, /车型参考图片画廊/);
  assert.match(i18n, /Manual Vehicle Lookup/);
  assert.match(i18n, /車種を手動検索/);
  assert.match(i18n, /AI enrichment is temporarily unavailable/);
  assert.match(i18n, /AI補完解析は一時的に利用できません/);
  assert.doesNotMatch(localizedUi, /Gemini/);
  assert.doesNotMatch(finder, /Vehicle Lens POC/);
  assert.match(finder, /error_\$\{cause\.code\}/);
  assert.doesNotMatch(finder, /payload\.error\?\.message/);
  assert.match(finder, /vehicle-lens-locale/);
  assert.match(finder, /locale,/);
  assert.match(finder, /enrichmentCache = useRef\(new Map/);
  assert.match(finder, /enrichmentRequest\.current\?\.key === requestKey/);
  assert.match(finder, /onClick=\{\(\) => changeLocale\(item\)\}/);
  assert.doesNotMatch(finder, /if \(decodedVin\) void enrichVinValue\(decodedVin\);/);
  assert.match(layout, /Vehicle Lens 车鉴/);
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

test("provides a server-side Gemini VIN enrichment endpoint", async () => {
  const route = await readFile(new URL("../app/api/vin/enrich/route.ts", import.meta.url), "utf8");
  assert.match(route, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(route, /"x-goog-api-key": apiKey/);
  assert.match(route, /gateway\.ai\.cloudflare\.com/);
  assert.match(route, /google-ai-studio\/v1beta\/interactions/);
  assert.match(route, /bindings\.CF_AI_GATEWAY_ACCOUNT_ID \|\| bindings\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(route, /cf-aig-authorization/);
  assert.match(route, /if \(searchGrounding\) requestBody\.tools = \[\{ type: "google_search" \}\]/);
  assert.match(route, /response_format:/);
  assert.match(route, /manufacturer:/);
  assert.match(route, /modelYear:/);
  assert.match(route, /displacementLiters:/);
  assert.match(route, /normalizeVehicle/);
  assert.match(route, /modelCandidates/);
  assert.match(route, /normalizeModelCandidates/);
  assert.match(route, /store: false/);
  assert.match(route, /\[vin:gemini:request\]/);
  assert.match(route, /\[vin:gemini:start\]/);
  assert.match(route, /\[vin:gemini:success\]/);
  assert.match(route, /\[vin:gemini:error\]/);
  assert.match(route, /safeUpstreamDetail/);
  assert.match(route, /upstreamDetail/);
  assert.match(route, /const maskedVin = `\$\{vin\.slice\(0, 11\)\}\*\*\*\*\*\*`/);
  assert.doesNotMatch(route, /console\.(?:info|log)\([^\n]*apiKey/);
  assert.match(route, /vin\.slice\(0, 11\).*\*\*\*\*\*\*/s);
  assert.match(route, /GEMINI_NOT_CONFIGURED/);
  assert.match(route, /Cache-Control": "private, no-store/);
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
  assert.match(example, /GEMINI_API_KEY=/);
  assert.match(example, /GEMINI_MODEL=gemini-3\.6-flash/);
  assert.match(example, /GEMINI_SEARCH_GROUNDING=false/);
  assert.match(example, /GEMINI_DEBUG_LOG=false/);
  assert.match(example, /CF_AI_GATEWAY_ACCOUNT_ID=/);
  assert.match(example, /CF_AI_GATEWAY_ID=/);
  assert.match(example, /CF_AI_GATEWAY_TOKEN=/);
  assert.match(renderer, /database_id: process\.env\.CF_D1_DATABASE_ID/);
  assert.match(renderer, /binding: "DB"/);
  assert.match(renderer, /GEMINI_MODEL: process\.env\.GEMINI_MODEL/);
  assert.match(renderer, /GEMINI_SEARCH_GROUNDING: process\.env\.GEMINI_SEARCH_GROUNDING/);
  assert.match(renderer, /GEMINI_DEBUG_LOG: process\.env\.GEMINI_DEBUG_LOG/);
  assert.match(renderer, /CF_AI_GATEWAY_ACCOUNT_ID: process\.env\.CF_AI_GATEWAY_ACCOUNT_ID/);
  assert.match(renderer, /CF_AI_GATEWAY_ID: process\.env\.CF_AI_GATEWAY_ID/);
  assert.match(renderer, /compatibility_date: "2026-05-22"/);
  assert.match(packageJson, /"cf:deploy"/);
  assert.match(packageJson, /CF_WORKER_DEPLOY=1 vinext deploy/);
  assert.match(viteConfig, /configPath: isCloudflareDeploy \? "\.\/wrangler\.jsonc" : "\.\/wrangler\.local\.jsonc"/);
  assert.doesNotMatch(viteConfig, /config: localBindingConfig/);
  assert.doesNotMatch(renderer, /CLOUDFLARE_API_TOKEN.*[A-Za-z0-9_-]{20}/);
});

test("publishes SEO and AI discovery metadata", async () => {
  const [layout, robots, sitemap, llms, llm] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
    readFile(new URL("../public/llms.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/llm.txt", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /"@type": "WebApplication"/);
  assert.match(layout, /application\/ld\+json/);
  assert.match(layout, /max-image-preview/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/vin\.carmodelx\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/vin\.carmodelx\.com\/<\/loc>/);
  assert.match(llms, /^# Vehicle Lens/m);
  assert.match(llms, /## Important limitations/);
  assert.match(llm, /https:\/\/vin\.carmodelx\.com\/llms\.txt/);
});
