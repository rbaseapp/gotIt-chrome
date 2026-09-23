export const LANGUAGE_OPTIONS = [
  ['en', 'English', 'English'],
  ['he', 'Hebrew', 'עברית'],
  ['ar', 'Arabic', 'العربية'],
  ['es', 'Spanish', 'Español'],
  ['fr', 'French', 'Français'],
  ['de', 'German', 'Deutsch'],
  ['it', 'Italian', 'Italiano'],
  ['pt', 'Portuguese', 'Português'],
  ['pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)'],
  ['ru', 'Russian', 'Русский'],
  ['uk', 'Ukrainian', 'Українська'],
  ['pl', 'Polish', 'Polski'],
  ['nl', 'Dutch', 'Nederlands'],
  ['tr', 'Turkish', 'Türkçe'],
  ['el', 'Greek', 'Ελληνικά'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['zh-CN', 'Chinese (Simplified)', '简体中文'],
  ['zh-TW', 'Chinese (Traditional)', '繁體中文'],
  ['ja', 'Japanese', '日本語'],
  ['ko', 'Korean', '한국어'],
  ['vi', 'Vietnamese', 'Tiếng Việt'],
  ['th', 'Thai', 'ไทย'],
  ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['sv', 'Swedish', 'Svenska'],
  ['da', 'Danish', 'Dansk'],
  ['no', 'Norwegian', 'Norsk'],
  ['fi', 'Finnish', 'Suomi'],
  ['cs', 'Czech', 'Čeština'],
  ['ro', 'Romanian', 'Română'],
  ['hu', 'Hungarian', 'Magyar']
] as const;

export function languageOptionLabel(englishName: string, nativeName: string): string {
  return englishName === nativeName ? englishName : `${englishName} — ${nativeName}`;
}

export function populateLanguageSelect(select: HTMLSelectElement, includeAuto = false): void {
  if (includeAuto) {
    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = document.documentElement.lang === 'he'
      ? 'זיהוי אוטומטי (Google)'
      : 'Automatic detection (Google)';
    select.append(automatic);
  }
  for (const [code, englishName, nativeName] of LANGUAGE_OPTIONS) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = languageOptionLabel(englishName, nativeName);
    select.append(option);
  }
}
