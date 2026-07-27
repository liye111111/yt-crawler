# Vehicle Query POC

基于 A-Premium 五级车型数据和 NHTSA vPIC VIN 解码 API 构建的车型查询 POC。

## 目录

```text
.
├── crawler/   # 数据抓取、SQLite、MySQL 导入及测试
├── site/      # Cloudflare Workers 站点和 API
└── TASKS.md   # POC 开发任务与验收标准
```

爬虫的运行与数据导入说明见 [`crawler/README.md`](crawler/README.md)。Cloudflare
站点的开发工作按 [`TASKS.md`](TASKS.md) 执行。
