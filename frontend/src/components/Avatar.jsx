import { getAvatarUrl } from "../lib/format";

export default function Avatar({ src, seed, size = 36, className = "" }) {
  return (
    <img
      src={src || getAvatarUrl(seed)}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-md border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    />
  );
}
