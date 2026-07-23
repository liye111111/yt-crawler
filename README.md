# A-Premium 车型数据爬虫

递归抓取 A-Premium 的 `year → make → model → trim → engine` 车型树。遇到
`isLeaf=true` 或 `attributeId=5` 时停止。原始节点和抓取进度保存在 SQLite，命令中断后可直接续跑。

## 使用

仅需 Python 3.10+，不依赖第三方包。

```bash
# 建议先抓单个年份验证
python3 crawler.py crawl --year 2026

# 可重复指定年份
python3 crawler.py crawl --year 2025 --year 2026

# 抓取全部年份（再次执行会从断点继续）
python3 crawler.py crawl

# 导出一行一条完整车型路径的 CSV
python3 crawler.py export --output data/vehicles.csv
```

默认每次请求间隔 0.2 秒，网络错误进行指数退避重试。可以用 `--delay`、`--timeout`、
`--retries` 调整；开发时可用 `--max-requests 10` 限制本次子请求数量。

数据库默认位于 `data/vehicles.sqlite3`。节点的 API 原始字段均被保留，并额外记录每个
非叶节点是否已经抓取过子节点。CSV 包含 `year,make,model,trim,engine,leaf_level,leaf_id`。
