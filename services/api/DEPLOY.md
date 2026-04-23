# Railway 部署指南

## 前提
- [Railway](https://railway.app) 账号（用 GitHub 登录）
- 代码已推送到 GitHub 仓库

## 1. 创建 PostgreSQL 数据库

1. 打开 [Railway Dashboard](https://railway.app/dashboard)
2. 点击 **New Project** → **Provision PostgreSQL**
3. 创建后，复制 `DATABASE_URL`（格式：`postgresql+asyncpg://user:pass@host:5432/dbname`）

## 2. 部署 API

1. Railway Dashboard → **New Project** → **Deploy from GitHub repo**
2. 选择 `tasktick` 仓库
3. Railway 会自动检测到 `services/api/Dockerfile`
4. 在 **Variables** 里添加：
   ```
   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
   JWT_SECRET_KEY=your-super-secret-key-change-this
   REDIS_URL=redis://default:@host:6379/0   # 可选，禁用限流可不填
   ```
5. 等待构建完成，Railway 会给你一个 URL，如 `https://tasktick-api.up.railway.app`

## 3. 部署前端

前端是纯静态文件，用 [Vercel](https://vercel.com) 或 [Netlify](https://netlify.com) 部署更方便：

1. 在本地运行 `pnpm build`（在 `apps/web` 目录）
2. 把 `dist` 文件夹拖到 Vercel/Netlify，或者连 GitHub 仓库自动部署
3. 构建命令：`pnpm install && pnpm --filter web build`
4. 环境变量：`VITE_API_URL=https://your-api-url.up.railway.app`

## 4. 配置前端环境变量

部署前端前，在 Vercel/Netlify 设置：
```
VITE_API_URL=https://your-api-url.up.railway.app
```

## 注意事项

- JWT_SECRET_KEY 生产环境必须改！不要用默认值
- Railway 免费额度有限，避免长时间跑很多实例
- Redis 可选，不填的话限流功能自动禁用
- 前端 API 地址必须填正确，否则请求会发到错误的地方
