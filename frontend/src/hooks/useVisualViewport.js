import { useEffect } from "react";

// iOS Safari при открытии клавиатуры не уменьшает layout viewport — меняется только
// visualViewport. Пишем его размеры в CSS-переменные: оболочка мессенджера сжимается,
// и поле ввода с последними сообщениями остаются над клавиатурой.
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    function update() {
      // При пинч-зуме visualViewport уменьшается: тогда раскладку не трогаем,
      // иначе страница вместо увеличения начала бы сжиматься
      if (Math.abs(vv.scale - 1) > 0.01) return;
      root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      root.style.setProperty("--app-offset", `${Math.round(vv.offsetTop)}px`);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset");
    };
  }, []);
}
