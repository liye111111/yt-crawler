# A-Premium 车型数据爬虫

递归抓取 A-Premium 的 `year → make → model → trim → engine` 车型树。遇到
`isLeaf=true` 或 `attributeId=5` 时停止。原始节点和抓取进度保存在 SQLite，命令中断后可直接续跑。

## 使用

仅需 Python 3.10+，不依赖第三方包。

以下命令默认在 `crawler/` 目录中执行：

```bash
cd crawler
```

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

## 导入 MySQL

先安装 MySQL 驱动：

```bash
python3 -m pip install -r requirements.txt
```

默认 MySQL 配置如下：

- 地址：`129.211.12.58:22008`
- 数据库：`yt`
- 用户名：`root`
- SQLite 文件：`data/vehicles.sqlite3`

密码通过环境变量传入，避免出现在脚本源码中：

```bash
export MYSQL_PASSWORD='你的密码'
```

### 1. 导入原始节点表

下面的命令将 SQLite `nodes` 表导入 MySQL `vehicle_nodes` 表。目标表不存在时会自动创建，
重复执行时按节点主键 upsert：

```bash
python3 import_mysql.py
```

可以指定其他 SQLite 文件、目标表或批量大小：

```bash
python3 import_mysql.py \
  --sqlite data/vehicles.sqlite3 \
  --table vehicle_nodes \
  --batch-size 1000
```

### 2. 重建并导入扁平车型表

先在 MySQL 中创建包含以下字段的目标表：

```text
year, make, model, trim, engine
```

然后将节点树重建为一行一条车型路径，并导入 `vehicles_20260723`：

```bash
python3 import_vehicle_paths_mysql.py
```

指定其他目标表：

```bash
python3 import_vehicle_paths_mysql.py \
  --sqlite data/vehicles.sqlite3 \
  --table vehicles_20260723 \
  --batch-size 1000
```

脚本将 `is_leaf=true` 或第 5 级节点作为完整路径。没有 engine 的提前叶子节点会以
`engine=NULL` 写入；导入前会读取目标表已有组合，并跳过重复的
`year/make/model/trim/engine` 记录。

### 覆盖连接配置

两个导入脚本都支持通过环境变量覆盖默认连接信息：

```bash
MYSQL_DB_URL='jdbc:mysql://host:3306/db?characterEncoding=utf-8&useSSL=false' \
MYSQL_USERNAME='root' \
MYSQL_PASSWORD='你的密码' \
python3 import_mysql.py
```

将最后一行替换为 `python3 import_vehicle_paths_mysql.py`，即可使用相同连接配置导入扁平表。
