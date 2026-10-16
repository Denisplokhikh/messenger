export function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function setDark(dark) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    // тема просто не запомнится
  }
}
