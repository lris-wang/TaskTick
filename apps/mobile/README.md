# TaskTick 移动端（Capacitor + Android）

使用 Capacitor 将 Web 应用打包为原生 Android 应用。

## 环境要求

- Node.js >= 18
- Android Studio（用于管理 Android SDK）
- Android SDK
- Java JDK 17+

## 快速开始

### 1. 安装依赖

```bash
cd apps/mobile
pnpm install
```

### 2. 构建 Web 应用（必须先执行）

```bash
cd apps/web
pnpm build
```

### 3. 同步到 Android 项目

```bash
cd apps/mobile
pnpm cap:sync
```

### 4. 运行调试版本

```bash
# 方式一：使用 Capacitor CLI 打开 Android Studio
pnpm cap:open:android
# 在 Android Studio 中点击 Run 按钮

# 方式二：直接构建 APK
pnpm android:assembleDebug
# APK 输出在 android/app/build/outputs/apk/debug/
```

## 构建发行版

### 构建 APK

```bash
pnpm android:assembleRelease
# APK 输出在 android/app/build/outputs/apk/release/
```

> 注意：release 构建需要签名配置，见下方「Android 签名配置」

### 签名 APK

```bash
# 方式一：使用 Gradle 自动签名（配置在 build.gradle）
./gradlew assembleRelease

# 方式二：手动签名
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore tasktick.keystore \
  app-release.apk tasktick

# 方式三：对未签名 APK 补签名
./gradlew signingConfigRelease
```

## Android 签名配置

### 创建签名密钥

```bash
# 生成签名密钥
keytool -genkey -v -keystore tasktick.keystore \
  -alias tasktick \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=TaskTick, OU=TaskTick, O=TaskTick, L=Beijing, C=CN"
```

### 配置环境变量

```bash
export KEYSTORE_PASSWORD=your_keystore_password
export KEY_PASSWORD=your_key_password
export KEY_ALIAS=tasktick
```

### 将密钥放入项目

```
apps/mobile/android/app/tasktick.keystore
```

### build.gradle 配置

已配置签名信息：

```groovy
signingConfigs {
    release {
        storeFile file("tasktick.keystore")
        storePassword System.getenv("KEYSTORE_PASSWORD") ?: "tasktick"
        keyAlias System.getenv("KEY_ALIAS") ?: "tasktick"
        keyPassword System.getenv("KEY_PASSWORD") ?: "tasktick"
    }
}
```

构建时取消 build.gradle 中的注释即可启用签名。

## 自动更新

使用 `@capacitor/updater` 实现热更新。

### 配置更新服务器

更新文件需托管在以下地址：

```
https://releases.tasktick.com/
  ├── updates/
  │   └── <version>/
  │       └── app.apk
  └── latest.yml
```

### Capacitor Updater 配置

```typescript
// capacitor.config.ts
plugins: {
  Updater: {
    autoUpdate: true,
    updateEndpoint: "https://releases.tasktick.com/updates",
  },
}
```

### 手动检查更新

```typescript
import { checkForAppUpdate, downloadAndInstallUpdate } from "../utils/mobile";

const update = await checkForAppUpdate();
if (update.available) {
  await downloadAndInstallUpdate();
}
```

## 已集成的 Capacitor 插件

| 插件 | 功能 |
|------|------|
| `@capacitor/core` | 核心功能 |
| `@capacitor/android` | Android 平台支持 |
| `@capacitor/haptics` | 触觉反馈 |
| `@capacitor/local-notifications` | 本地通知/提醒 |
| `@capacitor/preferences` | 本地键值存储 |
| `@capacitor/splash-screen` | 启动画面 |
| `@capacitor/status-bar` | 状态栏控制 |
| `@capacitor/updater` | 热更新 |

## Web 端移动端工具

在 `apps/web/src/utils/mobile.ts` 中提供了移动端专用 API：

```typescript
import {
  hapticsImpact,
  hapticsNotification,
  setStatusBarStyle,
  hideSplashScreen,
  scheduleTaskReminder,
  requestNotificationPermissions,
} from "../utils/mobile";

// 触觉反馈
await hapticsImpact("medium");
await hapticsNotification("success");

// 状态栏
await setStatusBarStyle(false); // false = light style

// 隐藏启动画面
await hideSplashScreen();

// 请求通知权限
const granted = await requestNotificationPermissions();

// 调度任务提醒
const notifId = await scheduleTaskReminder(task, new Date(task.dueAt));
```

> 注意：这些 API 在浏览器环境中是空操作，不会报错。

## 常见问题

### 同步失败

```bash
# 清理并重新同步
rm -rf android/app/build
pnpm cap:sync android
```

### Gradle 构建失败

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

### 缺少 Android SDK

在 Android Studio 中通过「SDK Manager」安装：
- Android SDK Platform 34
- Build-Tools 34.0.0
- Android SDK Command-line Tools

## 目录结构

```
apps/mobile/
├── capacitor.config.ts    # Capacitor 配置
├── package.json
├── README.md
├── scripts/
│   └── assemble-debug.mjs  # 构建脚本
└── android/               # Android 原生项目
    ├── app/
    │   ├── build.gradle   # 应用级 Gradle 配置
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       └── res/       # 资源文件（图标、启动画面等）
    ├── build.gradle       # 项目级 Gradle 配置
    └── gradle.properties  # Gradle 属性
```
