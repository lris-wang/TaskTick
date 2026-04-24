<<<<<<< HEAD
# TaskTick

滴答类任务/日程多端实验工程：pnpm monorepo，含 Web（Vue 3 + Vite）、Electron 桌面壳、Capacitor 移动端壳、共享包与 FastAPI 后端。

**远程仓库：** [https://github.com/LLDCoder/TaskTick.git](https://github.com/LLDCoder/TaskTick.git)

```bash
git clone https://github.com/LLDCoder/TaskTick.git
cd TaskTick
```

## 环境要求

| 组件 | 版本建议 |
|------|-----------|
| Node.js | 22.x |
| pnpm | 9.x（仓库已指定 `packageManager`） |
| Python（仅跑后端） | 3.12 |

## 安装依赖

在仓库根目录执行一次即可安装所有 workspace 包：

```bash
pnpm install
```

## 常用命令（根目录）

| 命令 | 说明 |
|------|------|
| `pnpm dev:web` | 启动 Web 开发服务器（默认 <http://127.0.0.1:5173>） |
| `pnpm dev:desktop` | 并行启动 Web 与 Electron（先等 Vite 就绪再开桌面） |
| `pnpm build` | 构建 `@tasktick/shared` 与 `@tasktick/web`（`dist/` 为生成物，不入库） |
| `pnpm lint:web` | Web 端 ESLint |
| `pnpm typecheck:web` | Web 端 `vue-tsc` 类型检查 |
| `pnpm dist:win` | 先 `pnpm build`，再打出 Windows **便携版** Electron 安装包（输出在 `apps/desktop/release/`，不入库） |
| `pnpm dist:android` | 先 `pnpm build`，再执行移动端 Debug 组装（需本机 Android SDK / Gradle） |

## 子项目说明

- **实现规划**：[docs/滴答类多端实现规划.md](docs/滴答类多端实现规划.md)
- **Web**：`apps/web`
- **桌面**：`apps/desktop`（读取 `../web/dist` 打进包内 `extraResources`）
- **共享契约**：`packages/shared`（构建产物在 `packages/shared/dist/`，由 `pnpm build` 生成）
- **后端 API**：`services/api`（环境变量见 `services/api/.env.example`；接口与 AI Token 说明见 [services/api/README.md](services/api/README.md)）

### 仅启动后端（示例）

```bash
cd services/api
pip install -r requirements.txt
# 按需复制 .env.example -> .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 源码与生成物：什么进 Git、什么进 Releases

- **提交到 Git 仓库的**：源码、`pnpm-lock.yaml`、配置与文档；**不包含** `node_modules/`、各包 `dist/`、`apps/desktop/release/`、Python 虚拟环境与缓存等（见根目录 [.gitignore](.gitignore)）。
- **GitHub Releases 附件**：预编译的 **Windows 便携版 `.exe`** 由 CI 在打 **以 `v` 开头的 tag**（例如 `v0.0.1`）并推送后自动构建并上传到对应 Release。本地构建的同名文件也可手动附加到 Release。

### 发布一个带附件的 Release（推荐流程）

1. 在 `apps/desktop/package.json`（及需要时根 `package.json`）中确认版本号一致。
2. 提交代码后创建并推送 tag：

   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

3. 在 GitHub 上打开自动创建的 Release（或手动补全 Release 说明）；工作流 **Release** 会将 `apps/desktop/release/` 下匹配 `*-windows-*-portable.exe` 的文件作为附件上传。

### 本地生成 Windows 便携版（不上传仓库）

```bash
pnpm dist:win
```

产物目录：`apps/desktop/release/`（已被 `.gitignore` 忽略，请通过 Release 或网盘分发）。

## CI

推送至 `main` / `master` 或对这些分支的 Pull Request 会触发 [.github/workflows/ci.yml](.github/workflows/ci.yml)：Web 构建与校验、API 的 Ruff / pytest / 冒烟脚本。
=======
# TaskTick
>>>>>>> 2b33a185fad2d540f8ec96fa5608b14f78c117cd
