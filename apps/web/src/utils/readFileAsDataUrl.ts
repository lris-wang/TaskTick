/** 将文件读为 Data URL（适合小附件本地持久化） */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("无法读取文件"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}
