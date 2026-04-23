import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, "..");
const androidDir = path.join(mobileRoot, "android");
const isWin = process.platform === "win32";
const gradle = isWin
  ? path.join(androidDir, "gradlew.bat")
  : path.join(androidDir, "gradlew");

const result = spawnSync(gradle, ["assembleDebug"], {
  stdio: "inherit",
  cwd: androidDir,
  shell: isWin,
});

process.exit(result.status ?? 1);
