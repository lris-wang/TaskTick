# TaskTick 桌面端（Electron）

开发模式会拉起 `apps/web` 的 Vite（`http://127.0.0.1:5173`），主进程以 `contextIsolation` + `preload` 加载页面；生产构建请先执行根目录 `pnpm build`，再打包 Electron（后续可接 electron-builder）。

在仓库根目录执行：

```bash
pnpm dev:desktop
```

## 构建发行版

```bash
# 构建 Web 资源（必需）
pnpm --filter web build

# 构建 Windows NSIS 安装包（推荐，支持自动更新）
pnpm --filter desktop dist:win

# 构建 Windows 便携版（无自动更新）
pnpm --filter desktop dist:win:portable
```

## 自动更新配置

自动更新使用 `electron-updater`，支持后台下载和安装提示。

### 更新服务器

需要在服务器上托管更新文件，配置 `publish.url`：

```json
"publish": [{
  "provider": "generic",
  "url": "https://releases.tasktick.com/"
}]
```

发布版本后，将 `release` 目录下的以下文件上传到更新服务器：

- `TaskTick-Setup-0.0.1-x64.exe` — NSIS 安装包
- `latest.yml` — 更新信息文件（electron-builder 自动生成）

### 更新流程

1. 用户启动应用 → 3 秒后检查更新
2. 发现新版本 → 后台下载
3. 下载完成 → 弹出提示「立即重启」或「稍后」
4. 用户选择「立即重启」→ 自动安装并启动新版本

## 代码签名（Windows Authenticode）

### 准备签名证书

**方法一：购买商业证书（推荐）**
- [DigiCert Code Signing](https://www.digicert.com/code-signing/)
- [Comodo Code Signing](https://comodoca.com/code-signing-certificates/)
- [SSL.com Code Signing](https://www.ssl.com/certificates/code-signing/)

**方法二：使用 Azure Trusted Signing（更便宜）**
- Azure 门户创建「代码签名账户」
- 支持 SHA256 和时间戳
- 费用约 $3.5/证书

**方法三：自签名（仅供开发测试）**
```powershell
# 创建自签名证书（仅用于测试）
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=TaskTick Development" -CertStoreLocation Cert:\CurrentUser\My
```

### 配置签名

1. **安装证书到当前用户个人存储**
2. **设置环境变量**
   ```bash
   # Windows (PowerShell)
   $env:CERTIFICATE_SUBJECT_NAME = "TaskTick"
   ```
3. **electron-builder 自动使用系统中匹配的证书**

### electron-builder 配置

```json
"win": {
  "certificateSubjectName": "TaskTick",
  "signingHashAlgorithms": ["sha256"]
}
```

### Azure Trusted Signing 示例

```json
"win": {
  "signingAzureConfig": {
    "azureAccessKey": "${env:AZURE_ACCESS_KEY}",
    "azureApplicationId": "${env:AZURE_APP_ID}",
    "azureCertificateProfile": "${env:AZURE_CERT_PROFILE}",
    "keyVaultUri": "${env:AZURE_KEY_VAULT_URI}",
    "keyVaultCertificateName": "${env:AZURE_CERT_NAME}"
  }
}
```

### 签名后验证

```powershell
# 查看签名信息
Get-AuthenticodeSignature "release\TaskTick-Setup-0.0.1-x64.exe"

# 查看证书详情
signtool verify /pa /v "release\TaskTick-Setup-0.0.1-x64.exe"
```

## 图标

将图标文件放入 `build/` 目录：

```
apps/desktop/build/
├── icon.ico        # Windows 程序图标
└── icon.png       # 可选：macOS/其他平台
```

> 注意：图标必须是 256x256 或更大尺寸的 PNG，electron-builder 会自动转换为所需格式。

## 目录结构

```
apps/desktop/
├── main.cjs        # Electron 主进程
├── preload.cjs    # 预加载脚本（IPC 桥接）
├── database.cjs   # SQLite 数据库（sql.js）
├── package.json
├── README.md
└── build/         # 图标等构建资源
```
