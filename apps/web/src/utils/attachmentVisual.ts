import type { TaskAttachment } from "@tasktick/shared";

export interface AttachmentVisual {
  /** 单字符或 emoji，用于列表小图标区 */
  icon: string;
  /** 中文类型说明 */
  typeLabel: string;
}

/** 根据 MIME 与扩展名返回展示用图标与类型文案 */
export function getAttachmentVisual(att: TaskAttachment): AttachmentVisual {
  const m = (att.mimeType || "").toLowerCase();
  const n = att.name.toLowerCase();

  if (m.startsWith("image/")) return { icon: "🖼", typeLabel: "图片" };
  if (m.includes("pdf") || n.endsWith(".pdf")) return { icon: "📕", typeLabel: "PDF" };
  if (m.includes("wordprocessingml") || m.includes("msword") || n.endsWith(".doc") || n.endsWith(".docx")) {
    return { icon: "📘", typeLabel: "Word" };
  }
  if (m.includes("spreadsheetml") || m.includes("excel") || n.endsWith(".xls") || n.endsWith(".xlsx")) {
    return { icon: "📗", typeLabel: "Excel" };
  }
  if (m.includes("presentationml") || n.endsWith(".ppt") || n.endsWith(".pptx")) {
    return { icon: "📙", typeLabel: "演示文稿" };
  }
  if (n.endsWith(".zip") || n.endsWith(".rar") || n.endsWith(".7z") || n.endsWith(".tar") || n.endsWith(".gz")) {
    return { icon: "🗂️", typeLabel: "压缩包" };
  }
  if (m.startsWith("audio/")) return { icon: "🎵", typeLabel: "音频" };
  if (m.startsWith("video/")) return { icon: "🎬", typeLabel: "视频" };
  if (n.endsWith(".md")) return { icon: "📝", typeLabel: "Markdown" };
  if (m.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".log")) return { icon: "📄", typeLabel: "文本" };
  if (n.endsWith(".csv")) return { icon: "📊", typeLabel: "CSV" };
  if (n.match(/\.(html?|xml)$/)) return { icon: "🌐", typeLabel: "网页 / XML" };
  if (n.match(/\.(ts|tsx|js|jsx|mjs|cjs|vue|css|scss|less|json)$/)) return { icon: "💾", typeLabel: "代码 / 配置" };
  if (m === "application/json") return { icon: "💾", typeLabel: "JSON" };

  const sub = m.split("/")[1];
  if (sub) return { icon: "📎", typeLabel: sub.slice(0, 18).toUpperCase() };
  return { icon: "📎", typeLabel: "附件" };
}
