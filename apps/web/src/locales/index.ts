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

const LOCALE_KEYS = [
  { key: "zh", nameKey: "localeNameZh" },
  { key: "en", nameKey: "localeNameEn" },
  { key: "ja", nameKey: "localeNameJa" },
  { key: "ko", nameKey: "localeNameKo" },
  { key: "es", nameKey: "localeNameEs" },
  { key: "fr", nameKey: "localeNameFr" },
  { key: "de", nameKey: "localeNameDe" },
  { key: "pt", nameKey: "localeNamePt" },
  { key: "ru", nameKey: "localeNameRu" },
  { key: "ar", nameKey: "localeNameAr" },
  { key: "hi", nameKey: "localeNameHi" },
  { key: "th", nameKey: "localeNameTh" },
  { key: "vi", nameKey: "localeNameVi" },
  { key: "id", nameKey: "localeNameId" },
] as const;

export function getSupportedLocales(): Array<{ label: string; value: string }> {
  return LOCALE_KEYS.map(({ key, nameKey }) => ({
    label: i18n.global.t(`settings.${nameKey}`),
    value: key,
  }));
}
