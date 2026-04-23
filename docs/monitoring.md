# 监控 — Sentry

TaskTick 使用 [Sentry](https://sentry.io) 进行前端和后端的崩溃监控。

## 前端（Web）

### 安装

Sentry 包已在 `apps/web/package.json` 中声明：

```json
"@sentry/vue": "^8.55.0"
```

### 配置

1. 在 [sentry.io](https://sentry.io) 创建项目，选择 **Vue**
2. 获取 DSN，格式为 `https://<key>@<org>.ingest.sentry.io/<project>`
3. 在 `.env` 中添加：

```
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### 初始化

`apps/web/src/main.ts` 中已完成初始化：

```typescript
import * as Sentry from "@sentry/vue";

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],
  tracePropagationTargets: [import.meta.env.VITE_API_URL],
});
```

全局错误处理器（Vue 渲染错误 + 未捕获的 Promise 拒绝）也已注册。

### 验证

开发环境启动后，在浏览器控制台执行：

```js
Sentry.captureException(new Error("test error"));
```

在 Sentry dashboard 中应能看到该错误。

## 后端（API）

### 安装

```bash
cd services/api
pip install sentry-sdk
```

### 配置

在 `services/api/app/main.py` 的 `lifespan` 中初始化：

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastAPIIntegration

sentry_sdk.init(
    dsn="https://xxxxx@xxxxx.ingest.sentry.io/xxxxx",
    integrations=[FastAPIIntegration()],
    traces_sample_rate=0.1,
)
```

## 私有化部署

如果使用 Docker Compose 私有化部署，可选方案：

| 方案 | 说明 |
|------|------|
| Sentry 官方 self-hosted | Docker 部署，资源消耗较大 |
| Glitchtip | 开源 Sentry 替代，资源占用更小 |
| Highlight.io | 开源选项，支持前端 + 后端 |
| 无 | 注释掉 DSN 即可禁用上报 |
