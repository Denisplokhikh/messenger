import { useEffect, useState } from "react";
import { api } from "../api/client";
import Avatar from "./Avatar";
import { SearchIcon } from "./icons";
import { Spinner, inputClass } from "./ui";

const DEBOUNCE_MS = 250;

// Поиск пользователей с выбором из списка. excludeIds — кого не показывать (себя, уже выбранных).
export default function UserSearch({ onSelect, excludeIds = [], actionLabel, autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await api.searchUsers(q);
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = results.filter((u) => !excludeIds.includes(u.id));

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя пользователя"
          autoFocus={autoFocus}
          className={`${inputClass} pl-8`}
        />
      </div>

      <div className="max-h-60 min-h-24 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !query.trim() ? (
          <p className="py-6 text-center text-xs text-zinc-500">Начните вводить имя</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">Никого не найдено</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelect(u)}
                  className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <Avatar src={u.avatar_url} seed={u.username} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.full_name || u.username}</span>
                    <span className="block truncate font-mono text-[11px] text-zinc-500">@{u.username}</span>
                  </span>
                  <span className="text-xs font-medium text-accent-text opacity-0 group-hover:opacity-100">
                    {actionLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
