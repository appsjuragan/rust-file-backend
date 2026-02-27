import { useState, useEffect, useCallback } from "react";
import { userService } from "../../../services/userService";

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    userService.updateSettings({ theme: newTheme }).catch(console.error);
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
