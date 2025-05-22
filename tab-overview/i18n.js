/* Internationalization helpers for Tab Overview */

// Translations for search placeholder
const translations = {
  en: "Search Tabs", // English
  es: "Buscar pestañas", // Spanish
  pt: "Buscar Abas", // Portuguese
  fr: "Rechercher onglets", // French
  de: "Tabs durchsuchen", // German
  it: "Cerca schede", // Italian
  nl: "Tabs zoeken", // Dutch
  ru: "Поиск вкладок", // Russian
  zh: "搜索标签页", // Chinese
  ja: "タブを検索", // Japanese
  ko: "탭 검색", // Korean
  ar: "البحث في علامات التبويب", // Arabic
  hi: "टैब खोजें", // Hindi
  tr: "Sekmeleri ara", // Turkish
};

/**
 * Gets localized text based on the user's browser language
 * @param {string} key - The translation key
 * @returns {string} - The localized text
 */
function getLocalizedText(key) {
  // Get browser language (e.g., "en-US" -> "en")
  const lang = (navigator.language || "en").split("-")[0];

  // If the key exists in translations and the language is supported
  if (translations[key] && translations[key][lang]) {
    return translations[key][lang];
  }

  // Fall back to English if language not supported
  return translations[key]?.en || key;
}

/**
 * Gets the search placeholder text in the user's language
 * @returns {string} - Localized search placeholder
 */
function getSearchPlaceholder() {
  const lang = (navigator.language || "en").split("-")[0];
  return translations[lang] || translations.en;
}

// Export functions for use in other files
export { getLocalizedText, getSearchPlaceholder };
