import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
  const defaults = { tema: 'Escuro', notificacoes: false, margem: 0, outros_custos: 0, perdas_calibracao_un: 0, valor_silk: 0, tamanho_alca: 0 };
    try {
      const raw = localStorage.getItem('cost-settings');
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  const value = useMemo(() => ({ settings, setSettings }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings deve ser usado dentro de <SettingsProvider>');
  return ctx;
}

// Busca configurações do backend quando o provider é montado
export function SettingsBootstrapper() {
  const { settings, setSettings } = useSettings();
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/configuracoes');
        const data = await res.json();
        if (!res.ok) return;
        if (!active) return;
        const { valor_silk: _ignoredSilk, ...rest } = data || {};
        const merged = { ...settings, ...rest };
        setSettings(merged);
        try { localStorage.setItem('cost-settings', JSON.stringify(merged)); } catch {}
      } catch {}
    })();
    return () => { active = false; };
  }, []);
  return null;
}
