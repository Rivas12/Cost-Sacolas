import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Calculator from './components/Calculator';
import CalculoEmLote from './components/CalculoEmLote';
import Gramaturas from './components/Gramaturas';
import Settings from './components/Settings';
import InserirLogo from './components/InserirLogo';
import StatusBadge from './components/StatusBadge';
import './App.css';
import { SettingsProvider, SettingsBootstrapper } from './context/SettingsContext';

const APP_PASSWORD = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_PASSWORD) || 'admin1243';

function App() {
  const [selected, setSelected] = useState('Calculadora');
  const [authed, setAuthed] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('auth_ok');
      if (v === '1') setAuthed(true);
    } catch {}
  }, []);

  const PUBLIC_SECTIONS = ['Calculadora', 'Inserir Logo'];

  const handleSelect = (label: string) => {
    setError('');

    if (PUBLIC_SECTIONS.includes(label)) {
      setSelected(label);
      return;
    }

    if (authed) {
      setSelected(label);
      return;
    }

    setPendingSelection(label);
    setPassword('');
    setShowModal(true);
  };

  const handleConfirmPassword = () => {
    if (password === APP_PASSWORD) {
      setAuthed(true);
      try { sessionStorage.setItem('auth_ok', '1'); } catch {}
      if (pendingSelection) setSelected(pendingSelection);
      setShowModal(false);
      setError('');
      setPendingSelection(null);
    } else {
      setError('Senha incorreta.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setError('');
    setPendingSelection(null);
    setPassword('');
  };

  const renderContent = () => {
    if (selected === 'Calculadora') return <Calculator onOpenBatch={() => handleSelect('Cálculo em Lote')} />;
    if (selected === 'Cálculo em Lote') return <CalculoEmLote />;
    if (selected === 'Inserir Logo') return <InserirLogo />;
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
            <div className="page-top">
              <StatusBadge />
            </div>
            {renderContent()}
          </div>
        </main>
        {showModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Protegido por senha">
            <div className="modal">
              <h3>Área protegida</h3>
              <p>Informe a senha para acessar {pendingSelection || 'esta área'}.</p>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmPassword(); }}>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha"
                  autoFocus
                />
              </form>
              {error && <span className="modal-error">{error}</span>}
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={handleCloseModal}>Cancelar</button>
                <button type="button" className="primary" onClick={handleConfirmPassword}>Entrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsProvider>
  );
}

export default App;
