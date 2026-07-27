# 车型查询 POC 开发任务

## 1. 项目目标

使用 Cloudflare Workers、D1 和现有五级车型数据，交付一个可公开访问的车型查询 POC：

1. 支持 `Year → Make → Model → Trim → Engine` 五级联动查询。
2. 支持输入 VIN，通过 NHTSA vPIC 解码。
3. 将 vPIC 的解码结果映射到本地车型，并返回精确结果或候选车型。
4. 记录匹配效果，为后续汽配适配工具和 API 产品验证需求。

POC 暂不包含用户系统、支付、商品适配、复杂管理后台和多数据源自动同步。

## 2. 目录约定

```text
.
├── crawler/
│   ├── crawler.py
│   ├── import_mysql.py
│   ├── import_vehicle_paths_mysql.py
│   ├── requirements.txt
│   ├── test_crawler.py
│   └── data/vehicles.sqlite3
├── site/
│   ├── src/
│   ├── web/
│   ├── migrations/
│   ├── scripts/
│   ├── test/
│   ├── package.json
│   └── wrangler.jsonc
└── TASKS.md
```

## 3. 技术方案

- 前端：React + Vite。
- 后端：Cloudflare Workers + TypeScript。
- 数据库：Cloudflare D1。
- VIN 数据源：NHTSA vPIC `DecodeVinValues` API。
- 部署工具：Wrangler。
- 测试：Vitest。

Workers 同时提供静态页面和 `/api/*` 接口。车型路径存储在 D1；VIN 请求先查缓存，
未命中时调用 vPIC，然后执行名称标准化和本地车型匹配。

## 4. 里程碑和任务

### M1：初始化站点工程

- [ ] 在 `site/` 初始化 Workers + React + Vite + TypeScript。
- [ ] 配置 Wrangler、D1 binding 和本地开发环境。
- [ ] 配置格式化、类型检查和 Vitest。
- [ ] 增加 `/api/health` 健康检查。
- [ ] 验证本地前端和 Worker API 可以同时运行。

完成标准：`npm run dev` 可启动站点，`/api/health` 返回成功响应。

### M2：准备 D1 车型数据

- [ ] 设计 `vehicle_paths` 表及查询索引。
- [ ] 设计 `vehicle_aliases` 名称别名表。
- [ ] 设计 `vin_decode_cache` VIN 缓存表。
- [ ] 编写 `site/scripts/build_d1_data.py`。
- [ ] 从 `crawler/data/vehicles.sqlite3` 重建扁平车型路径。
- [ ] 将 A-Premium 节点 ID 作为 `TEXT` 写入，避免 JavaScript 大整数精度丢失。
- [ ] 生成 D1 兼容的 schema 和数据 SQL。
- [ ] 使用 Wrangler 导入本地 D1 并核对各层级数量。

建议的核心表：

```sql
CREATE TABLE vehicle_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  engine TEXT,
  year_node_id TEXT,
  make_node_id TEXT,
  model_node_id TEXT,
  trim_node_id TEXT,
  engine_node_id TEXT,
  make_normalized TEXT NOT NULL,
  model_normalized TEXT NOT NULL,
  trim_normalized TEXT,
  engine_normalized TEXT,
  path_key TEXT NOT NULL UNIQUE
);
```

完成标准：D1 中的完整路径数量与 SQLite 重建结果一致，提前叶子节点允许
`engine IS NULL`。

### M3：实现五级车型查询 API

- [ ] `GET /api/vehicles/years`
- [ ] `GET /api/vehicles/makes?year=`
- [ ] `GET /api/vehicles/models?year=&make=`
- [ ] `GET /api/vehicles/trims?year=&make=&model=`
- [ ] `GET /api/vehicles/engines?year=&make=&model=&trim=`
- [ ] `GET /api/vehicles/match?...`
- [ ] `GET /api/vehicles/search?q=`
- [ ] 使用参数绑定，禁止拼接用户输入到 SQL。
- [ ] 为只读列表响应设置合理的缓存头。
- [ ] 增加参数缺失、无结果和异常响应测试。

完成标准：五级联动可以查到唯一车型或明确的候选列表，常用查询目标响应时间低于
500ms。

### M4：接入 VIN 解码和车型匹配

- [ ] 实现 `POST /api/vin/decode`。
- [ ] 校验 VIN 为17位，并排除 `I`、`O`、`Q`。
- [ ] 为 vPIC 请求设置超时和错误处理。
- [ ] 解析 `Model Year`、`Make`、`Model`、`Trim`、排量、气缸和燃料类型。
- [ ] 实现大小写、空格、连字符和常见品牌别名标准化。
- [ ] 按 Year、Make、Model、Trim、Engine 逐级缩小候选集。
- [ ] 返回匹配层级、置信度和候选车型。
- [ ] 使用 `vin_decode_cache` 缓存结果，建议有效期7天。
- [ ] 对 VIN 接口增加基础限频。

匹配评分建议：

| 匹配层级 | 置信度 |
|---|---:|
| Year + Make + Model + Trim + Engine | 100 |
| Year + Make + Model + Trim | 90 |
| Year + Make + Model | 80 |
| Year + Make | 50 |
| 无匹配 | 0 |

完成标准：vPIC 不可用时接口能够正常降级；不能唯一识别 Trim/Engine 时返回候选项，
不伪造精确结果。

### M5：实现前端页面

- [ ] 首页提供 VIN 输入和手动查询入口。
- [ ] 实现五级联动选择器。
- [ ] 实现 VIN 解码加载、成功、无匹配和错误状态。
- [ ] 展示 vPIC 解码信息、本地匹配结果和置信度。
- [ ] 提供候选 Trim/Engine 供用户二次确认。
- [ ] 增加“车型不正确”反馈入口。
- [ ] 完成移动端适配和基础无障碍支持。

完成标准：用户可以在手机和桌面端完成手动查询与 VIN 查询，整个流程不存在死路。

### M6：部署与验收

- [ ] 创建开发和生产 D1 数据库。
- [ ] 导入车型数据并核对数量。
- [ ] 部署 Worker 和静态资源。
- [ ] 配置域名、HTTPS、日志和基础监控。
- [ ] 使用至少50个真实 VIN 进行人工核验。
- [ ] 记录精确匹配率、候选匹配率和无匹配率。
- [ ] 整理未匹配原因和下一阶段数据需求。
- [ ] 在公开推广前确认车型数据的商业使用授权。

## 5. API 响应约定

成功响应：

```json
{
  "ok": true,
  "data": {}
}
```

错误响应：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_VIN",
    "message": "VIN must contain 17 valid characters"
  }
}
```

VIN 匹配结果至少包含：

```json
{
  "decoded": {
    "year": 2010,
    "make": "Toyota",
    "model": "Prius",
    "trim": null,
    "engine": null
  },
  "match": {
    "level": "model",
    "confidence": 80,
    "candidates": []
  }
}
```

## 6. POC 验收指标

- [ ] 五级查询链路可用。
- [ ] VIN 解码接口具备超时、缓存和错误降级。
- [ ] 大整数节点 ID 无精度损失。
- [ ] 重复 VIN 不重复调用 vPIC。
- [ ] 手机端可顺畅完成查询。
- [ ] 至少50个真实 VIN 完成人工核验。
- [ ] 能统计精确匹配率、候选匹配率和无匹配率。

POC 的首要判断指标是匹配质量与查询完成率，而不是访问量。
