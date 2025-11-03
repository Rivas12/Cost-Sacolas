import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Calculator from './components/Calculator';
import CalculoEmLote from './components/CalculoEmLote';
import Gramaturas from './components/Gramaturas';
import Settings from './components/Settings';
import './App.css';
import { SettingsProvider, SettingsBootstrapper } from './context/SettingsContext';

function App() {
  const [selected, setSelected] = useState('Calculadora');
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('auth_ok');
      if (v === '1') setAuthed(true);
    } catch {}
  }, []);

  const handleSelect = (label: string) => {
    // Calculadora é pública
    if (label === 'Calculadora') {
      setSelected(label);
      return;
    }
    // Se já autenticado na sessão, libera
    if (authed) {
      setSelected(label);
      return;
    }
    // Prompt simples de senha
    const pwd = window.prompt('Digite a senha para acessar esta área:');
    if (pwd === null) return; // cancelado
    if (pwd === 'admin1243') {
      setAuthed(true);
      try { sessionStorage.setItem('auth_ok', '1'); } catch {}
      setSelected(label);
    } else {
      window.alert('Senha incorreta.');
    }
  };

  const renderContent = () => {
  if (selected === 'Calculadora') return <Calculator onOpenBatch={() => handleSelect('Cálculo em Lote')} />;
    if (selected === 'Cálculo em Lote') return <CalculoEmLote />;
    if (selected === 'Gramaturas') return <Gramaturas />;
    if (selected === 'Configurações') return <Settings />;

    return (
      <div className="main-title">
        <h1>{selected}</h1>
        <p>Bem-vindo ao painel {selected.toLowerCase()}!</p>
      </div>
    );
  };

  return (
    <SettingsProvider>
      <div className="app-container">
  <SettingsBootstrapper />
  <Sidebar onSelect={handleSelect} selected={selected} />
        <main className="main-content">
          <div className="page-container">
            {renderContent()}
          </div>
        </main>
      </div>
    </SettingsProvider>
  );
}

export default App;
