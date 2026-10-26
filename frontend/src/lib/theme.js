export function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function setDark(dark) {
  document.documentElement.classList.toggle("dark", dark);
  // Адресная строка мобильного браузера красится под тему
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#ffffff");
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    // тема просто не запомнится
  }
}
