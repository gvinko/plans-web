import { createContext, useContext, useEffect, useState } from 'react';
import { APP_CONFIG } from '@/config/app.config';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => {
      try { return localStorage.getItem('app-theme') || APP_CONFIG.defaultTheme || 'system'; }
      catch { return APP_CONFIG.defaultTheme || 'system'; }
    }
  );

  useEffect(() => {
    try { localStorage.setItem('app-theme', theme); } catch { /* preferences are optional */ }

    const apply = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
