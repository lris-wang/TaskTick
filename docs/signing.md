# 代码签名指南

## 生成签名密钥

### Windows (.exe / NSIS 安装包)

从证书颁发机构（CA）购买 **代码签名证书**，推荐：
- [DigiCert Code Signing](https://www.digicert.com/code-signing/)
- [Sectigo Code Signing](https://sectigo.com/code-signing-certificates)
- [SSL Dragon](https://www.ssldragon.com/code-signing-certificates)（性价比高）

> **EV 证书推荐**：EV（扩展验证）证书签名后**直接信任**，无需用户点击"仍然运行"，体验最好。

### macOS (.dmg)

需要 Apple **Developer ID** 证书：

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)（年费 $99）
2. 在 [Certificates, Identifiers & Profiles](https://developer.apple.com) 创建 **Developer ID Application** 证书
3. 下载并导出为 `.p12` 格式

### Android (.apk / .aab)

```bash
# 生成签名密钥（只需执行一次，务必妥善保存！）
keytool -genkey -v -keystore release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias tasktick \
  -storetype JKS

# 导出 Base64（用于 GitHub Secrets）
base64 -i release.jks -o release.jks.b64
```

---

## 配置 GitHub Secrets

进入 **Settings → Secrets and variables → Actions**，添加以下密钥：

| Secret 名称 | 对应平台 | 说明 |
|-------------|---------|------|
| `WINDOWS_CERTIFICATE_BASE64` | Windows | `.pfx` / `.p12` 文件的 Base64 内容 |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows | 证书密码 |
| `APPLE_CERTIFICATE_BASE64` | macOS | `.p12` 文件的 Base64 内容 |
| `APPLE_CERTIFICATE_PASSWORD` | macOS | `.p12` 密码 |
| `APPLE_TEAM_ID` | macOS | Apple Team ID（可在 Apple Developer Portal 查看）|
| `APPLE_ID` | macOS | Apple 开发者账号邮箱 |
| `APPLE_APP_PASSWORD` | macOS | [App Specific Password](https://support.apple.com/en-us/1024292) |
| `KEYCHAIN_PASSWORD` | macOS | GitHub Actions 临时钥匙串密码（任意值）|
| `RELEASE_KEYSTORE_BASE64` | Android | `release.jks` 的 Base64 内容 |
| `RELEASE_KEYSTORE_PASSWORD` | Android | keystore 密码 |
| `RELEASE_KEY_ALIAS` | Android | 密钥别名（如 `tasktick`）|
| `RELEASE_KEY_PASSWORD` | Android | 密钥密码 |
| `ANDROID_VITE_API_URL` | Android | 生产环境 API URL（可选）|

---

## 构建流程

### 自动构建（推荐）

打标签自动触发 GitHub Actions：

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会自动：
1. 安装依赖
2. 构建前端 dist
3. 签名（如果有证书）
4. 生成安装包（.exe / .dmg / .apk）
5. 发布到 GitHub Releases

### 本地构建（无签名）

```bash
# Windows
cd apps/desktop && pnpm install && pnpm run dist:win:portable

# macOS
cd apps/desktop && pnpm install && pnpm run dist:mac

# Android
cd apps/mobile && pnpm install && pnpm run android:assembleDebug
```

---

## macOS 公证（Notarization）

macOS 构建完成后必须经过 Apple 公证，否则 macOS Gatekeeper 会拦截。

GitHub Actions 中已包含 `notarize` 步骤，需要：
1. Apple Developer 账号
2. App Specific Password（上面 Secrets 中的 `APPLE_APP_PASSWORD`）

---

## 注意事项

- **密钥安全**：不要把 `.jks` / `.p12` / `.pfx` 提交到代码仓库
- **备份密钥**：签名密钥丢失无法更新已发布的应用
- **EV 证书**：推荐购买，签名后 Windows 直接信任，用户体验最好
- **时间戳**：`electron-builder` 默认使用 `http://timestamp.digicert.com` RFC3161 时间戳，确保证书过期后安装包仍然有效
