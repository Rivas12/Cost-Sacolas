import React, { useEffect, useState } from 'react';
import './Settings.css';
import { useSettings } from '../context/SettingsContext';

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const [impostos, setImpostos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [novoImposto, setNovoImposto] = useState({ nome: '', valor: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const API = {
    LISTAR: '/api/impostos_fixos',
    CRIAR: '/api/impostos_fixos',
    ATUALIZAR: (id) => `/api/impostos_fixos/${id}`,
    DELETAR: (id) => `/api/impostos_fixos/${id}`,
    CONFIG_GET: '/api/configuracoes',
    CONFIG_PUT: '/api/configuracoes',
  };

  const toNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    const s = String(val).replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  useEffect(() => {
    const carregar = async () => {
      setLoading(true); setError('');
      try {
        // Busca impostos e configurações em paralelo
        const [resImp, resCfg] = await Promise.all([
          fetch(API.LISTAR),
          fetch(API.CONFIG_GET),
        ]);

        const dataImp = await resImp.json();
        const dataCfg = await resCfg.json();

        if (!resImp.ok) throw new Error(dataImp?.error || 'Erro ao buscar impostos');
        if (!resCfg.ok) throw new Error(dataCfg?.error || 'Erro ao buscar configurações');

        setImpostos(Array.isArray(dataImp) ? dataImp : []);
        // Aplica configurações do servidor
        if (dataCfg) {
          setSettings((s) => ({
            ...s,
            margem: dataCfg.margem ?? s.margem,
            outros_custos: dataCfg.outros_custos ?? s.outros_custos,
            perdas_calibracao_un: dataCfg.perdas_calibracao_un ?? s.perdas_calibracao_un ?? 0,
            valor_silk: dataCfg.valor_silk ?? s.valor_silk ?? 0,
            tema: dataCfg.tema ?? s.tema,
            notificacoes: !!dataCfg.notificacoes,
          }));
        }
      } catch (e) {
        setError(e.message || 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const salvarImposto = async (imp) => {
    setError('');
    const payload = { nome: imp.nome, valor: toNumber(imp.valor) };
    const isNovo = !imp.id;
    const url = isNovo ? API.CRIAR : API.ATUALIZAR(imp.id);
    const method = isNovo ? 'POST' : 'PUT';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao salvar');
    // Atualiza lista local
    if (isNovo) setImpostos((list) => [...list, data]);
    else setImpostos((list) => list.map((i) => (i.id === imp.id ? { ...i, ...payload } : i)));
  };

  const removerImposto = async (id) => {
    setError('');
    const res = await fetch(API.DELETAR(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao excluir');
    setImpostos((list) => list.filter((i) => i.id !== id));
  };

  const salvarTudo = async () => {
    setError('');
    setSaved('');
    setSaving(true);
    try {
      // Salva configurações globais no banco
      const cfgPayload = {
        margem: toNumber(settings.margem),
        outros_custos: toNumber(settings.outros_custos),
        perdas_calibracao_un: parseInt(settings.perdas_calibracao_un || 0),
        valor_silk: toNumber(settings.valor_silk),
        tema: settings.tema,
        notificacoes: !!settings.notificacoes,
      };
      const resCfg = await fetch(API.CONFIG_PUT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfgPayload),
      });
      const dataCfg = await resCfg.json();
      if (!resCfg.ok) throw new Error(dataCfg?.error || 'Falha ao salvar configurações');
      // Atualiza context e localStorage com o que veio do servidor
      setSettings((s) => ({ ...s, ...dataCfg }));
      try { localStorage.setItem('cost-settings', JSON.stringify({ ...settings, ...dataCfg })); } catch {}

      // Atualiza todos os existentes
      const updates = impostos
        .filter((imp) => !!imp.id)
        .map(async (imp) => {
          const payload = { nome: imp.nome, valor: toNumber(imp.valor) };
          const res = await fetch(API.ATUALIZAR(imp.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Falha ao salvar ${imp.nome}`);
          return true;
        });

      await Promise.all(updates);

      // Cria todos os novos (sem id)
      const novos = impostos.filter((imp) => !imp.id && imp.nome && imp.valor !== '');
      for (const imp of novos) {
        const payloadNovo = { nome: imp.nome, valor: toNumber(imp.valor) };
        const resNovo = await fetch(API.CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadNovo),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${imp.nome}`);
      }

      // Se existir algo digitado na linha "novo imposto", adiciona como novo também
      if (novoImposto.nome && novoImposto.valor !== '') {
        const payloadNovo = { nome: novoImposto.nome, valor: toNumber(novoImposto.valor) };
        const resNovo = await fetch(API.CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadNovo),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${novoImposto.nome}`);
        setNovoImposto({ nome: '', valor: '' });
      }

      // Recarrega a lista para refletir ids e valores corretos
      try {
        const resList = await fetch(API.LISTAR);
        const dataList = await resList.json();
        if (resList.ok) setImpostos(Array.isArray(dataList) ? dataList : []);
      } catch {}

      setSaved('Alterações salvas com sucesso.');
    } catch (e) {
      setError(e.message || 'Falha ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="settings-wrap" aria-label="Configurações">
      <h2 className="settings-title">Configurações</h2>
      <p className="settings-sub">Defina preferências gerais e os percentuais padrão usados nos cálculos.</p>

      <div className="settings-card">
  <div className="settings-grid">

          <div className="settings-field">
            <label htmlFor="margem">Margem (%)</label>
            <div className="input-suffix">
              <input
                id="margem"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={settings.margem}
                onChange={(e) => setSettings((s) => ({ ...s, margem: e.target.value }))}
              />
              <span className="suffix">%</span>
            </div>
            <small>Aplicado por padrão na Calculadora</small>
          </div>

          <div className="settings-field">
            <label htmlFor="outros">Outros Custos (%)</label>
            <div className="input-suffix">
              <input
                id="outros"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={settings.outros_custos}
                onChange={(e) => setSettings((s) => ({ ...s, outros_custos: e.target.value }))}
              />
              <span className="suffix">%</span>
            </div>
            <small>Percentual de custos adicionais</small>
          </div>

          <div className="settings-field">
            <label htmlFor="perdas">Perdas de calibração (mt)</label>
            <input
              id="perdas"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={settings.perdas_calibracao_un || 0}
              onChange={(e) => setSettings((s) => ({ ...s, perdas_calibracao_un: e.target.value }))}
            />
            <small>Unidades extras produzidas para calibrar a máquina</small>
          </div>

          <div className="settings-field">
            <label htmlFor="silk">Valor silk (R$)</label>
            <div className="input-suffix">
              <input
                id="silk"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={settings.valor_silk || 0}
                onChange={(e) => setSettings((s) => ({ ...s, valor_silk: e.target.value }))}
              />
              <span className="suffix">R$</span>
            </div>
            <small>Valor fixo por unidade; quando ativado, soma em cada peça</small>
          </div>
        </div>

      </div>

      <div className="settings-card">
        <h3 style={{marginTop:0}}>Impostos fixos</h3>
        <p className="settings-sub" style={{marginTop:4}}>Gerencie a lista de impostos fixos usados no cálculo.</p>

        {error && <div className="calc-error" style={{color:'#b30000', marginBottom:10}}>{error}</div>}
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Nome</th>
                <th style={{textAlign:'left'}}>Percentual</th>
                <th style={{width:90, textAlign:'left'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {impostos.map((imp) => (
                <tr key={imp.id}>
                  <td>
                    <input
                      placeholder="Ex.: IRPJ"
                      value={imp.nome}
                      onChange={(e) => setImpostos((list) => list.map((i) => i.id === imp.id ? { ...i, nome: e.target.value } : i))}
                    />
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={imp.valor}
                        onChange={(e) => setImpostos((list) => list.map((i) => i.id === imp.id ? { ...i, valor: e.target.value } : i))}
                      />
                      <span className="suffix">%</span>
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn-icon danger"
                        onClick={() => removerImposto(imp.id)}
                        type="button"
                        aria-label={`Excluir ${imp.nome}`}
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <input placeholder="Novo imposto" value={novoImposto.nome} onChange={(e)=>setNovoImposto((n)=>({...n, nome:e.target.value}))} />
                </td>
                <td>
                  <div className="input-suffix">
                    <input type="number" step="0.01" placeholder="0,00" value={novoImposto.valor} onChange={(e)=>setNovoImposto((n)=>({...n, valor:e.target.value}))} />
                    <span className="suffix">%</span>
                  </div>
                </td>
                <td>
                  <button className="btn-ghost small" type="button" onClick={()=>{ if(!novoImposto.nome) return; setImpostos((list)=>[...list, { nome: novoImposto.nome, valor: novoImposto.valor }]); setNovoImposto({nome:'', valor:''}); }}>Adicionar</button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="settings-actions right">
          {saved && <span className="save-ok">{saved}</span>}
          <button className="btn-primary" type="button" onClick={salvarTudo} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
