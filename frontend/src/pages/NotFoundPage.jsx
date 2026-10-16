import { Link } from "react-router-dom";
import { FullScreenMessage } from "../components/ui";

export default function NotFoundPage({ message = "Такой страницы нет." }) {
  return (
    <FullScreenMessage>
      <p className="font-mono text-5xl font-medium tracking-tight text-zinc-300 dark:text-zinc-700">404</p>
      <p className="text-sm text-zinc-500">{message}</p>
      <Link to="/" className="text-sm font-medium text-accent-text hover:underline">
        На главную
      </Link>
    </FullScreenMessage>
  );
}
