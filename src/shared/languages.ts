export const LANGUAGE_OPTIONS = [
  ['en', 'English'], ['he', 'עברית'], ['ar', 'العربية'], ['es', 'Español'],
  ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'],
  ['pt-BR', 'Português (Brasil)'], ['ru', 'Русский'], ['uk', 'Українська'],
  ['pl', 'Polski'], ['nl', 'Nederlands'], ['tr', 'Türkçe'], ['el', 'Ελληνικά'],
  ['hi', 'हिन्दी'], ['zh-CN', '中文（简体）'], ['zh-TW', '中文（繁體）'],
  ['ja', '日本語'], ['ko', '한국어'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'],
  ['id', 'Bahasa Indonesia'], ['sv', 'Svenska'], ['da', 'Dansk'], ['no', 'Norsk'],
  ['fi', 'Suomi'], ['cs', 'Čeština'], ['ro', 'Română'], ['hu', 'Magyar']
] as const;

export function populateLanguageSelect(select: HTMLSelectElement, includeAuto = false): void {
  if (includeAuto) {
    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = document.documentElement.lang === 'he'
      ? 'זיהוי אוטומטי (Google)'
      : 'Automatic detection (Google)';
    select.append(automatic);
  }
  const displayNames = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' });
  for (const [code, label] of LANGUAGE_OPTIONS) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${displayNames.of(code) ?? label} · ${code}`;
    select.append(option);
  }
}
