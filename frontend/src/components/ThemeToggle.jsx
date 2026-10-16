import { useState } from "react";
import { isDark, setDark } from "../lib/theme";
import { MoonIcon, SunIcon } from "./icons";
import { IconButton } from "./ui";

export default function ThemeToggle() {
  const [dark, setDarkState] = useState(isDark);

  function toggle() {
    setDark(!dark);
    setDarkState(!dark);
  }

  return (
    <IconButton label={dark ? "Светлая тема" : "Тёмная тема"} onClick={toggle}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
