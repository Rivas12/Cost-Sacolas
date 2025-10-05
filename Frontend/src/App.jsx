import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Calculator from './components/Calculator';
import Settings from './components/Settings';
import './App.css';
import { SettingsProvider } from './context/SettingsContext';

export default function App() {
  const [selected, setSelected] = useState('Dashboard');

  const renderContent = () => {
    if (selected === 'Calculadora') return <Calculator />;
    if (selected === 'Configurações') return <Settings />;
    return <div style={{ margin: 32, color: '#232323' }}><h1>{selected}</h1></div>;
  };

  return (
    <SettingsProvider>
      <div className="app-container">
        <Sidebar onSelect={setSelected} selected={selected} />
        <main className="main-content">
          <div className="page-container">
            {renderContent()}
          </div>
        </main>
      </div>
    </SettingsProvider>
  );
}
