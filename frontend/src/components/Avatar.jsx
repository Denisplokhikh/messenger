import { getAvatarUrl } from "../lib/format";

export default function Avatar({ src, seed, size = 36, online = false, className = "" }) {
  const image = (
    <img
      src={src || getAvatarUrl(seed)}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    />
  );

  if (!online) return image;

  // Зелёная точка «в сети»: размер зависит от аватара, чтобы не выглядеть чужеродно
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {image}
      <span
        aria-label="в сети"
        title="в сети"
        className="absolute right-0 bottom-0 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"
        style={{ width: dot, height: dot }}
      />
    </span>
  );
}
