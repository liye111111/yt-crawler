# Vehicle Lens 车型查询站点

基于 Cloudflare Workers 的车型查询站点。本地使用 Wrangler/Miniflare 模拟 D1，线上可以
使用相同的 schema、migration 和查询代码连接 Cloudflare D1。

## 功能

- `Year → Make → Model → Trim → Engine` 五级 D1 查询。
- VIN 格式校验和 NHTSA vPIC 解码。
- VIN 解码结果自动匹配本地年份、品牌、车系和配置款。
- 支持 Trim 或 Engine 为 NULL 的提前叶子节点。
- CSV 批量转换、路径哈希去重和可重复导入。

## 初始化本地 D1

需要 Node.js 22.13+、Python 3 和原始 CSV：

```text
~/Downloads/vehicles_2026-07-27.csv
```

安装依赖并生成 migration：

```bash
npm install
npm run db:generate
```

应用 migration：

```bash
npm run db:local:migrate
```

把 CSV 转换为批量导入 SQL：

```bash
python3 scripts/build_d1_import.py
```

导入本地 Miniflare D1：

```bash
npm run db:local:import
```

生成的 `data/vehicle_paths.sql` 和本地 D1 文件均被 Git 忽略。重复执行导入会先清空
`vehicle_paths`，然后完整重建数据。

## 本地运行

```bash
npm run dev
```

默认访问 `http://localhost:3000`；如果端口已占用，请使用终端显示的实际地址。

## API

```text
GET  /api/vehicles/catalog
GET  /api/vehicles/makes?year=2025
GET  /api/vehicles/models?year=2025&make=Toyota
GET  /api/vehicles/trims?year=2025&make=Toyota&model=Camry
GET  /api/vehicles/engines?year=2025&make=Toyota&model=Camry&trim=XSE
GET  /api/vehicles/details?year=2025&make=Toyota&model=Camry
POST /api/vin/decode
POST /api/vin/enrich
POST /api/vin/pattern
GET  /api/vin/random
```

VIN 请求示例：

```json
{"vin":"JTDKN3DU4A0000000"}
```

`/api/vin/enrich` 是 Worker 服务端的 Gemini 补充解析接口。它先读取 NHTSA 上下文，
再通过 Gemini Google Search 查询 WMI、VDS、年款码和工厂码的公开资料。发送给 Gemini
的 VIN 会隐藏第12–17位生产序列号，响应中的每段信息均标记为 `inferred` 或
`unverified`，并附带搜索引用；它不会覆盖 NHTSA 已确认的数据。

接口返回结构示例：

```json
{
  "ok": true,
  "data": {
    "vin": "LBV31FX08RM******",
    "source": "gemini-google-search",
    "segments": [],
    "sources": [],
    "disclaimer": "Gemini 内容是基于公开网页的补充推断……"
  }
}
```

VIN 输入区的“随机 VIN”按钮会调用 `/api/vin/random`。Worker 服务端请求
`https://randomvin.com/getvin.php?type=real`，校验返回值后再交给前端填入输入框，
避免浏览器因第三方接口未提供 CORS 响应头而拦截请求。随机 VIN 填入后会自动触发
NHTSA 解析，无需再次点击“解析 VIN”。

选择车型后，前端会调用 `/api/vin/pattern`，在“VIN 字段说明”区域生成17位 VIN
结构伪码，并分别解释
WMI（1–3位）、VDS（4–8位）、校验位（第9位）、年款（第10位）、装配工厂
（第11位）和生产序列号（12–17位）。当前车型数据无法确定的位置使用 `*`，不会
伪造可被误认为真实车辆身份的 VIN。

通过 VIN 查询时，这一区域会切换为 NHTSA 模式：展示完整17位查询 VIN，并在每个
分段卡片中明确列出 vPIC 返回的品牌、车系、配置、车身、年份和动力信息。界面会
区分“VIN 字符已提供”和“厂商编码含义已解析”，避免将完整 VIN 误解为所有分段
规则均已公开。VIN 查询后继续选择本地配置款或发动机不会清除 NHTSA 规格、图片与
字段说明；只有修改年款、品牌或车系时才会退出当前 VIN 查询结果。

页面底部同时展示 NHTSA 车辆规格详情，按“基本信息、动力与传动、车身与制造”分组。
接口未返回的字段统一标记为“未提供”；vPIC 不提供的车辆图片、市场价格等内容不会
使用推测值填充。

手工查询选完车系后也会异步加载车辆规格：本地 D1 返回车型组合、配置款和发动机
统计，NHTSA Canadian Vehicle Specifications 补充车长、车宽、车高、轴距、整备
质量等车型级数据。没有真实 VIN 时，页面不会将这些资料描述为具体车辆信息。

车型规格出现后，前端会异步调用 `/api/vehicles/image`，由 Worker 查询 Wikimedia
Commons。图片查询不会阻塞 VIN 解码；页面使用懒加载图片，并展示作者、授权协议和
来源页面。最多展示5张去重后的图片，点击缩略图可切换主图及对应授权信息。图片统一
标注为“同款车型参考图”，不代表该 VIN 对应的实际车辆。

## 验证

```bash
npm run build
npm test
```

当前导入结果：284,070条车型路径、109个年份、379个品牌。

## 发布到 Cloudflare Workers

### 1. 准备 Cloudflare 资源

在 Cloudflare Dashboard 中创建一个 D1 数据库，并记录数据库名称和 UUID。创建 API
Token 时需要授予 Workers Scripts 和 D1 编辑权限。

编辑项目根目录的 `.env`，填写以下配置：

```dotenv
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CF_WORKER_NAME=vehicle-lens
CF_D1_DATABASE_NAME=vehicle-lens-db
CF_D1_DATABASE_ID=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
GEMINI_SEARCH_GROUNDING=false
GEMINI_DEBUG_LOG=false
CF_AI_GATEWAY_ACCOUNT_ID=
CF_AI_GATEWAY_ID=
CF_AI_GATEWAY_TOKEN=
```

`.env` 已被 Git 忽略，不会进入版本库。可提交的字段模板位于 `.env.example`。
线上还需要把 `GEMINI_API_KEY` 保存为 Worker Secret；普通 `.env` 不会自动上传密钥：

```bash
CLOUDFLARE_API_TOKEN='' npx wrangler secret put GEMINI_API_KEY --env-file /dev/null
```

`GEMINI_SEARCH_GROUNDING` 默认是 `false`：Gemini 不调用 Google Search，所有模型补充
内容统一标记为 `unverified`，也不返回网页引用。设置为 `true` 后才启用 Google Search
Grounding，并允许有引用支持的字段标记为 `inferred`；该模式需要对应的搜索额度或计费。

本地排查 Gemini 请求时可设置 `GEMINI_DEBUG_LOG=true`。终端会输出
`[vin:gemini:request]` 日志，其中包含请求地址、脱敏 VIN、提示词、模型和结构化输出参数；
API Key、AI Gateway Token 与 VIN 第12–17位不会写入日志。

配置 `CF_AI_GATEWAY_ID` 后，Gemini 请求会通过 Cloudflare AI Gateway 的
Google AI Studio provider-native endpoint 发出；`CF_AI_GATEWAY_ACCOUNT_ID` 未填写时使用
`CLOUDFLARE_ACCOUNT_ID`。仅当 Gateway 开启 Authenticated Gateway 时才需要设置
`CF_AI_GATEWAY_TOKEN`，并应将它保存为 Worker Secret：

```bash
CLOUDFLARE_API_TOKEN='' npx wrangler secret put CF_AI_GATEWAY_TOKEN --env-file /dev/null
```

### 2. 检查凭据并生成生产配置

```bash
npm run cf:whoami
npm run cf:config
```

`cf:config` 会校验 `.env`，然后生成被 Git 忽略的 `wrangler.jsonc`。D1 在 Worker
中的绑定名称固定为 `DB`，与当前代码一致。兼容日期固定为当前项目内置
Miniflare/workerd 支持的 `2026-05-22`。

### 3. 初始化线上 D1

如果尚未生成导入 SQL：

```bash
python3 scripts/build_d1_import.py --input ~/Downloads/vehicles_2026-07-27.csv
```

依次应用表结构并导入车型数据：

```bash
npm run db:remote:migrate
npm run db:remote:import
```

导入脚本会重建 `vehicle_paths` 数据。请勿在包含其他业务数据的 D1 数据库中执行。

### 4. 构建并发布 Worker

```bash
npm test
npm run cf:deploy
```

`cf:deploy` 使用 Vinext 构建应用并调用 Wrangler 发布。成功后终端会显示
`https://<worker-name>.<subdomain>.workers.dev` 地址。后续代码更新通常只需要重新执行：

```bash
npm run cf:deploy
```

发布命令会设置 `CF_WORKER_DEPLOY=1`，使 Vite 只读取生产 `wrangler.jsonc`；普通
开发、构建和测试只读取 `wrangler.local.jsonc`，避免本地与线上 D1 重复绑定。

只有数据库迁移或车型数据发生变化时，才需要再次执行对应的 D1 命令。生成的
`wrangler.jsonc` 与车型导入 SQL 均不会提交到 Git。
