import { useEffect, useState } from "react";

// Перерисовывает компонент раз в intervalMs, чтобы «5 минут назад» не застывало
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
