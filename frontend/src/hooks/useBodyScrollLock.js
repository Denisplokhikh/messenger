import { useEffect } from "react";

// Пока открыта модалка, страница под ней не прокручивается.
// На iOS overflow: hidden у body сам по себе не всегда помогает, но вместе с фиксированной
// оболочкой мессенджера этого достаточно
export function useBodyScrollLock() {
  useEffect(() => {
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    // Компенсируем ширину скроллбара, чтобы десктопная страница не дёргалась
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, []);
}
