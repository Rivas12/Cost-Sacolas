declare module './context/SettingsContext' {
  import React from 'react';

  export interface SettingsState {
    tema: 'Escuro' | 'Claro';
    notificacoes: boolean;
    margem: number | string;
    outros_custos: number | string;
  }

  export const SettingsProvider: React.FC<React.PropsWithChildren<{}>>;
  export function useSettings(): { settings: SettingsState; setSettings: React.Dispatch<React.SetStateAction<SettingsState>> };
  export const SettingsBootstrapper: React.FC;
}

declare module './components/Gramaturas' {
  import React from 'react';
  const Gramaturas: React.FC;
  export default Gramaturas;
}

declare module './components/Settings' {
  import React from 'react';
  const Settings: React.FC;
  export default Settings;
}
