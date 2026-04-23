import { createI18n } from "vue-i18n";
import en from "./en.json";
import zh from "./zh.json";
import ja from "./ja.json";
import ko from "./ko.json";
import es from "./es.json";
import fr from "./fr.json";
import de from "./de.json";
import pt from "./pt.json";
import ru from "./ru.json";
import ar from "./ar.json";
import hi from "./hi.json";
import th from "./th.json";
import vi from "./vi.json";
import id from "./id.json";

const STORAGE_KEY = "tasktick.locale";

function getInitialLocale(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  const supported = ["en", "zh", "ja", "ko", "es", "fr", "de", "pt", "ru", "ar", "hi", "th", "vi", "id"];
  if (stored && supported.includes(stored)) return stored;
  if (navigator.language.startsWith("zh")) return "zh";
  if (navigator.language.startsWith("ja")) return "ja";
  if (navigator.language.startsWith("ko")) return "ko";
  if (navigator.language.startsWith("ar")) return "ar";
  if (navigator.language.startsWith("hi")) return "hi";
  if (navigator.language.startsWith("th")) return "th";
  if (navigator.language.startsWith("vi")) return "vi";
  if (navigator.language.startsWith("id")) return "id";
  if (navigator.language.startsWith("pt")) return "pt";
  if (navigator.language.startsWith("ru")) return "ru";
  if (navigator.language.startsWith("de")) return "de";
  if (navigator.language.startsWith("fr")) return "fr";
  if (navigator.language.startsWith("es")) return "es";
  return "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en",
  messages: {
    en,
    zh,
    ja,
    ko,
    es,
    fr,
    de,
    pt,
    ru,
    ar,
    hi,
    th,
    vi,
    id,
  },
});

export function setLocale(locale: string) {
  (i18n.global.locale as unknown as { value: string }).value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
}

export function getLocale(): string {
  return i18n.global.locale.value;
}

export const SUPPORTED_LOCALES = [
  { label: "简体中文", value: "zh" },
  { label: "English", value: "en" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Português", value: "pt" },
  { label: "Русский", value: "ru" },
  { label: "العربية", value: "ar" },
  { label: "हिन्दी", value: "hi" },
  { label: "ไทย", value: "th" },
  { label: "Tiếng Việt", value: "vi" },
  { label: "Bahasa Indonesia", value: "id" },
];
