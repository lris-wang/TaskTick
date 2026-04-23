/** 单附件最大字节（约 4MB，避免 localStorage 过快撑满） */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** 单任务附件个数上限 */
export const MAX_ATTACHMENTS_PER_TASK = 10;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
