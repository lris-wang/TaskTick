# Alembic 数据库迁移

使用 Alembic 管理 SQLAlchemy 模型的数据库迁移。

## 初始化（首次设置）

```bash
cd services/api

# 安装依赖
pip install alembic

# 初始化 Alembic（如果还没有 alembic.ini）
alembic init alembic
```

## 常用命令

### 查看当前数据库状态

```bash
alembic current
```

### 查看迁移历史

```bash
alembic history --verbose
```

### 升级到最新版本

```bash
alembic upgrade head
```

### 降级指定版本

```bash
# 降级到上一个版本
alembic downgrade -1

# 降级到最初
alembic downgrade base
```

### 生成新迁移

```bash
alembic revision --autogenerate -m "描述"
```

> 注意：`--autogenerate` 会自动检测模型变更，但需要正确配置 `env.py` 中的 `target_metadata`。

## 创建新迁移示例

```bash
# 1. 修改模型（如 app/models/task.py）

# 2. 生成迁移
alembic revision --autogenerate -m "add priority to tasks"

# 3. 检查生成的文件
cat alembic/versions/xxxx_add_priority_to_tasks.py

# 4. 应用迁移
alembic upgrade head
```

## 环境变量

Alembic 使用 `app.config.Settings` 读取数据库 URL：

```bash
# SQLite（默认）
export DATABASE_URL=sqlite+aiosqlite:///./tasktick.db

# PostgreSQL
export DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
```

## 生产环境使用

```bash
# 应用所有待执行迁移
alembic upgrade head

# 回滚一个版本
alembic downgrade -1

# 查看当前版本
alembic current
```

## 目录结构

```
services/api/
├── alembic/
│   ├── env.py              # Alembic 环境配置（异步支持）
│   ├── script.py.mako       # 迁移脚本模板
│   ├── README.md            # 本文档
│   └── versions/
│       └── 001_initial.py   # 初始迁移（创建所有表）
└── alembic.ini              # Alembic 配置文件
```

## 模型与迁移同步

修改模型后，使用 `alembic revision --autogenerate` 生成迁移脚本。
手动检查生成的脚本，确保变更正确。

## 故障排除

### 迁移失败

```bash
# 查看详细错误
alembic upgrade head --verbose

# 如果是表已存在错误，检查是否有多余的迁移
alembic history
```

### PostgreSQL 特定问题

PostgreSQL 使用 `uuid` 类型，需要安装扩展：
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Alembic 会自动处理大部分情况。
