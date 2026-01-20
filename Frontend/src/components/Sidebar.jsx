import React from 'react';
import './Sidebar.css';


const menuItems = [
  { icon: '💰', label: 'Calculadora' },
  { icon: '📦', label: 'Cálculo em Lote' },
  { icon: '🖼️', label: 'Inserir Logo' },
  { icon: '🧮', label: 'Gramaturas'},
  { icon: '⚙️', label: 'Configurações' },
];

export default function Sidebar({ onSelect, selected }) {
  return (
    <aside className="sidebar" aria-label="Menu lateral">
      <div className="sidebar-logo">
        <span role="img" aria-label="rocket" className="logo-icon">🚀</span>
        <span className="logo-text">SACOLAS CALC</span>
      </div>
      <nav className="sidebar-menu">
        {menuItems.map((item, idx) => (
          <button
            key={idx}
            className={`sidebar-menu-item${selected === item.label ? ' active' : ''}`}
            onClick={() => onSelect(item.label)}
            aria-current={selected === item.label ? 'page' : undefined}
            tabIndex={0}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
