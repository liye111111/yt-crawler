# Vehicle Query POC

基于 A-Premium 五级车型数据和 NHTSA vPIC VIN 解码 API 构建的车型查询 POC。

## 目录

```text
.
├── crawler/   # 数据抓取、SQLite、MySQL 导入及测试
├── site/      # Cloudflare Workers 站点、VIN API 和本地车型数据
└── TASKS.md   # POC 开发任务与验收标准
```

爬虫的运行与数据导入说明见 [`crawler/README.md`](crawler/README.md)。站点运行说明见
[`site/README.md`](site/README.md)，后续工作按 [`TASKS.md`](TASKS.md) 执行。
