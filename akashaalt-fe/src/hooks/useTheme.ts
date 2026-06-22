import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function getStored(): Theme {
  return (localStorage.getItem("theme") as Theme | null) ?? "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStored);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
