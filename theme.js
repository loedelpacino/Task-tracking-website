// theme.js – ortak tema yardımcıları
export function applySavedTheme() {
  const t = localStorage.getItem("theme");
  if (t === "dark") {
    document.documentElement.classList.add("dark-theme");
    // body sonradan ekranda ise de ekle
    document.addEventListener("DOMContentLoaded", () =>
      document.body.classList.add("dark-theme")
    );
  }
}

export function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark-theme");
  const isDark = body.classList.contains("dark-theme");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  document.documentElement.classList.toggle("dark-theme", isDark);
}

// İlk boyamada gecikmesiz uygula
applySavedTheme();
