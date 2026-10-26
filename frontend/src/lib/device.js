// Сенсорный экран без мыши: :hover там не наступает, на него нельзя полагаться
export function isTouchOnly() {
  return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
}

// Есть мышь и физическая клавиатура: только там уместны автофокус и подсказки про Enter
export function hasPointer() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
