# TaskTick 后端

## 当前已实现能力

- **健康检查**：`GET /health`
- **启动建表**：SQLite（默认）或 PostgreSQL（`DATABASE_URL`），SQLAlchemy `create_all`（尚未接 Alembic 迁移）
- **数据模型**：`User`、`ApiToken`（仅存 token 哈希）、`Schedule`（日程）
- **脚本**：`python -m scripts.create_ai_token` 为用户创建 AI 用 Bearer Token（明文仅打印一次）
- **AI 日程 API**（Bearer 鉴权，仅能访问 token 绑定用户的数据）：
  - `GET /api/v1/ai/schedules`：列表，支持 `from`、`to`、`limit`
  - `POST /api/v1/ai/schedules`：创建
  - `GET /api/v1/ai/schedules/{id}`：详情
  - `PATCH /api/v1/ai/schedules/{id}`：部分更新
  - `DELETE /api/v1/ai/schedules/{id}`：删除
- **MinIO 对象存储**（可选；未配置 `MINIO_*` 时文件接口返回 **503**）：
  - 启动时尝试创建默认 **Bucket**
  - `POST /api/v1/ai/files/upload`：`multipart/form-data`，字段名 **`file`**
  - `GET /api/v1/ai/files/presign?object_key=...`：返回预签名下载 URL（JSON）
  - `DELETE /api/v1/ai/files/{object_key}`：`object_key` 含多级路径；仅允许删除 **本用户前缀** `{user_id}/` 下对象
- **OpenAPI**：`/docs`、`/redoc`

**未实现**（相对规划）：用户注册登录 JWT、通用任务 REST、同步 push/pull、Redis、SSE、Alembic、Docker 部署等。

### MinIO 本地启动

在 `services/api` 目录：

```bash
docker compose -f docker-compose.minio.yml up -d
```

控制台默认 `http://127.0.0.1:9001`，API `127.0.0.1:9000`，账号密码见 `docker-compose.minio.yml`。将 `.env.example` 中 `MINIO_*` 复制到 `.env` 后重启 `uvicorn` 即可启用上传。

## AI 日程接口

使用长期 **Bearer Token**（仅存 SHA-256 哈希）鉴权，读写 **当前 token 绑定用户** 的日程。

- 基础路径：`/api/v1/ai/schedules`
- 请求头：`Authorization: Bearer <你的token>`
- OpenAPI 文档：启动服务后访问 `/docs`

### 生成 Token

在 `services/api` 目录执行（需先安装依赖）：

```bash
pip install -r requirements.txt
python -m scripts.create_ai_token --email you@example.com --name my-agent
```

终端会打印 **仅出现一次** 的明文 token，请交给 AI 服务或密钥管理系统。

### 自动化测试

在 **`services/api` 目录**下执行（`pytest.ini` 已配置 `pythonpath = .`，以便解析 `app` 包）：

```bash
pip install -r requirements-dev.txt
pytest -q
```

**用例覆盖（pytest）**

| 文件 | 内容 |
|------|------|
| `tests/test_health.py` | `GET /health` |
| `tests/test_openapi.py` | `GET /docs`、`GET /openapi.json` 路由存在性 |
| `tests/test_ai_auth.py` | AI 接口 401（无/错 Token、错误 scheme）、404（不存在 id） |
| `tests/test_ai_schedules.py` | AI 日程 CRUD 全流程 |
| `tests/test_ai_schedules_filters.py` | `from` / `to` 查询参数过滤 |
| `tests/test_ai_validation.py` | 创建日程缺少必填字段 → 422 |
| `tests/test_ai_files.py` | 文件上传 503（未配 MinIO）、Fake MinIO 下上传/预签名/删除 |

**启动真实服务并 HTTP 冒烟（脚本）**

自动起临时 SQLite、子进程 `uvicorn`、建 Token、用 `httpx` 调接口，结束后关闭进程并删库：

```bash
python -m scripts.run_api_smoke
```

可选：`SMOKE_HOST`（默认 `127.0.0.1`）、`SMOKE_PORT`（默认 `18991`），或参数 `--host` / `--port`。

### 启动服务

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 环境变量

复制 `.env.example` 为 `.env`，按需修改 `DATABASE_URL`。生产建议使用 PostgreSQL：`postgresql+asyncpg://...`
