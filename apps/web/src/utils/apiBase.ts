/**
 * Gets the current API base URL based on deployment mode stored in localStorage.
 */
const STORAGE_KEY = "tasktick.auth.v1";
export const CLOUD_API_URL = "https://tasktick-1.onrender.com";
export const LOCAL_API_URL = "http://localhost:8000";

export function getApiBase(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.deploymentMode === "local") return LOCAL_API_URL;
    }
  } catch {}
  return CLOUD_API_URL;
}