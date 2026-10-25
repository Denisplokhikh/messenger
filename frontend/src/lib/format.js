export function getAvatarUrl(seed) {
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed || "user")}`;
}

export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Для разделителей дат в ленте
export function formatDay(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Сегодня";
  if (isSameDay(date, yesterday)) return "Вчера";
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
}

// Для списка чатов: сегодня — время, иначе — короткая дата
export function formatChatTime(iso) {
  if (!iso) return "";
  if (isSameDay(iso, new Date())) return formatTime(iso);
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// «был(а) в сети 5 минут назад». now передаётся, чтобы подпись обновлялась по таймеру
export function formatLastSeen(iso, now = Date.now()) {
  if (!iso) return "не в сети";

  const then = new Date(iso);
  const diffMs = Math.max(0, now - then.getTime());
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "был(а) в сети только что";
  if (minutes < 60) {
    return `был(а) в сети ${minutes} ${plural(minutes, ["минуту", "минуты", "минут"])} назад`;
  }

  const time = formatTime(iso);
  if (isSameDay(then, new Date(now))) return `был(а) в сети сегодня в ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(then, yesterday)) return `был(а) в сети вчера в ${time}`;

  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  const date = then.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  });
  return `был(а) в сети ${date}`;
}

// plural(5, ["участник", "участника", "участников"]) → "участников"
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Сервер принимает сообщения до 1000 символов — длинный текст режем на куски,
// стараясь резать по переносу строки или пробелу
export function splitTextIntoChunks(text, maxLength = 1000) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.7) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// 1536 → "1,5 КБ"
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}
