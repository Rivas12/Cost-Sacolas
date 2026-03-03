import React, { useEffect, useState } from 'react';
import './Settings.css';
import { useSettings } from '../context/SettingsContext';
import { apiFetch, apiJson } from '../utils/apiClient';

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const [impostos, setImpostos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [custosAdicionais, setCustosAdicionais] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', imposto_percentual: '' });
  const [novoCusto, setNovoCusto] = useState({ nome: '', valor: '', a_cada: 1, min_1: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const API = {
    LISTAR: '/impostos_fixos',
  CRIAR: '/impostos_fixos',
  ATUALIZAR: (id) => `/impostos_fixos/${id}`,
    SERVICOS_LISTAR: '/servicos',
    SERVICOS_CRIAR: '/servicos',
    SERVICOS_ATUALIZAR: (id) => `/servicos/${id}`,
    SERVICOS_DELETAR: (id) => `/servicos/${id}`,
    CUSTOS_LISTAR: '/custos_adicionais',
    CUSTOS_CRIAR: '/custos_adicionais',
    CUSTOS_ATUALIZAR: (id) => `/custos_adicionais/${id}`,
    CUSTOS_DELETAR: (id) => `/custos_adicionais/${id}`,
    CONFIG_GET: '/configuracoes',
    CONFIG_PUT: '/configuracoes',
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
        // Busca impostos, configurações, serviços e custos adicionais em paralelo
        const [dataImp, dataCfg, dataServ, dataCustos] = await Promise.all([
          apiJson(API.LISTAR),
          apiJson(API.CONFIG_GET),
          apiJson(API.SERVICOS_LISTAR).catch((e) => []),
          apiJson(API.CUSTOS_LISTAR).catch((e) => []),
        ]);

        setImpostos(Array.isArray(dataImp) ? dataImp : []);
        const listaServicos = Array.isArray(dataServ) ? dataServ : [];
        setServicos(listaServicos);
        const listaCustos = Array.isArray(dataCustos) ? dataCustos : [];
        setCustosAdicionais(listaCustos);
        // Não traz mais valor_silk para o contexto; serviços serão marcados manualmente
        // Aplica configurações do servidor
        if (dataCfg) {
          setSettings((s) => ({
            ...s,
            margem: dataCfg.margem ?? s.margem,
            perdas_calibracao_un: dataCfg.perdas_calibracao_un ?? s.perdas_calibracao_un ?? 0,
            tamanho_alca: dataCfg.tamanho_alca ?? s.tamanho_alca ?? 0,
            custo_cordao: dataCfg.custo_cordao ?? s.custo_cordao ?? 0,
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
    const payload = { valor: toNumber(imp.valor) };
    const res = await apiFetch(API.ATUALIZAR(imp.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao salvar');
    setImpostos((list) => list.map((i) => (i.id === imp.id ? { ...i, valor: payload.valor } : i)));
  };

  const salvarServico = async (svc) => {
    setError('');
    const payload = {
      nome: svc.nome,
      valor: toNumber(svc.valor),
      imposto_percentual: toNumber(svc.imposto_percentual ?? svc.imposto ?? svc.impostos),
    };
    const isNovo = !svc.id;
    const url = isNovo ? API.SERVICOS_CRIAR : API.SERVICOS_ATUALIZAR(svc.id);
    const method = isNovo ? 'POST' : 'PUT';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao salvar serviço');
    if (isNovo) setServicos((list) => [...list, data]);
    else setServicos((list) => list.map((i) => (i.id === svc.id ? { ...i, ...payload } : i)));
  };

  const removerServico = async (id) => {
    setError('');
    const res = await apiFetch(API.SERVICOS_DELETAR(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao excluir serviço');
    setServicos((list) => list.filter((i) => i.id !== id));
  };

  // CRUD Custos Adicionais
  const salvarCustoAdicional = async (custo) => {
    setError('');
    const payload = {
      nome: custo.nome,
      valor: toNumber(custo.valor),
      a_cada: parseInt(custo.a_cada) || 1,
      min_1: custo.min_1 !== false,
    };
    const isNovo = !custo.id;
    const url = isNovo ? API.CUSTOS_CRIAR : API.CUSTOS_ATUALIZAR(custo.id);
    const method = isNovo ? 'POST' : 'PUT';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao salvar custo adicional');
    if (isNovo) {
      setCustosAdicionais((list) => [...list, data]);
    } else {
      setCustosAdicionais((list) => list.map((i) => (i.id === custo.id ? { ...i, ...payload } : i)));
    }
  };

  const removerCustoAdicional = async (id) => {
    setError('');
    const res = await apiFetch(API.CUSTOS_DELETAR(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao excluir custo adicional');
    setCustosAdicionais((list) => list.filter((i) => i.id !== id));
  };

  const salvarTudo = async () => {
    setError('');
    setSaved('');
    setSaving(true);
    try {
      // Salva configurações globais no banco
        const cfgPayload = {
        margem: toNumber(settings.margem),
        perdas_calibracao_un: parseInt(settings.perdas_calibracao_un || 0),
        tamanho_alca: parseFloat(settings.tamanho_alca || 0),
        custo_cordao: parseFloat(settings.custo_cordao || 0),
        ipi_percentual: parseFloat(settings.ipi_percentual || 0),
        tema: settings.tema,
        notificacoes: !!settings.notificacoes,
      };
      const resCfg = await apiFetch(API.CONFIG_PUT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfgPayload),
      });
      const dataCfg = await resCfg.json();
      if (!resCfg.ok) throw new Error(dataCfg?.error || 'Falha ao salvar configurações');
      // Atualiza context e localStorage com o que veio do servidor
  const { valor_silk: _ignoredSilk, ...cfgRetornada } = dataCfg || {};
  setSettings((s) => ({ ...s, ...cfgRetornada }));
  try { localStorage.setItem('cost-settings', JSON.stringify({ ...settings, ...cfgRetornada })); } catch {}

      // Atualiza todos os existentes
      const updates = impostos
        .filter((imp) => !!imp.id)
        .map(async (imp) => {
          const payload = { valor: toNumber(imp.valor) };
          const res = await apiFetch(API.ATUALIZAR(imp.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Falha ao salvar ${imp.nome}`);
          return true;
        });

      await Promise.all(updates);

      // Atualiza/insere serviços
      const svcUpdates = servicos
        .filter((svc) => !!svc.id)
        .map(async (svc) => {
          const payload = {
            nome: svc.nome,
            valor: toNumber(svc.valor),
            imposto_percentual: toNumber(svc.imposto_percentual ?? svc.imposto ?? svc.impostos),
          };
          const res = await apiFetch(API.SERVICOS_ATUALIZAR(svc.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Falha ao salvar ${svc.nome}`);
          return true;
        });

      await Promise.all(svcUpdates);

      const novosServicos = servicos.filter((svc) => !svc.id && svc.nome && svc.valor !== '');
      for (const svc of novosServicos) {
        const payload = {
          nome: svc.nome,
          valor: toNumber(svc.valor),
          imposto_percentual: toNumber(svc.imposto_percentual ?? svc.imposto ?? svc.impostos),
        };
        const resNovo = await apiFetch(API.SERVICOS_CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${svc.nome}`);
      }

      if (novoServico.nome && novoServico.valor !== '') {
        const payloadNovo = {
          nome: novoServico.nome,
          valor: toNumber(novoServico.valor),
          imposto_percentual: toNumber(novoServico.imposto_percentual || 0),
        };
        const resNovo = await apiFetch(API.SERVICOS_CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadNovo),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${novoServico.nome}`);
        setNovoServico({ nome: 'Silk', valor: '', imposto_percentual: '' });
      }

      // Salva custos adicionais
      const custosExistentes = custosAdicionais.filter((c) => !!c.id);
      for (const custo of custosExistentes) {
        const payload = {
          nome: custo.nome,
          valor: toNumber(custo.valor),
          a_cada: parseInt(custo.a_cada) || 1,
          min_1: custo.min_1 !== false,
        };
        const res = await apiFetch(API.CUSTOS_ATUALIZAR(custo.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Falha ao salvar ${custo.nome}`);
      }

      // Adiciona novos custos
      if (novoCusto.nome && novoCusto.valor !== '') {
        const payloadNovo = {
          nome: novoCusto.nome,
          valor: toNumber(novoCusto.valor),
          a_cada: parseInt(novoCusto.a_cada) || 1,
          min_1: novoCusto.min_1 !== false,
        };
        const resNovo = await apiFetch(API.CUSTOS_CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadNovo),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${novoCusto.nome}`);
        setNovoCusto({ nome: '', valor: '', a_cada: 1, min_1: true });
      }

      // Recarrega a lista para refletir ids e valores corretos
      try {
        const dataList = await apiJson(API.LISTAR);
        setImpostos(Array.isArray(dataList) ? dataList : []);
        const dataSvc = await apiJson(API.SERVICOS_LISTAR);
        setServicos(Array.isArray(dataSvc) ? dataSvc : []);
        const dataCustos = await apiJson(API.CUSTOS_LISTAR);
        setCustosAdicionais(Array.isArray(dataCustos) ? dataCustos : []);
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
            <label htmlFor="perdas">Perdas de calibração (mt)</label>
            <div className="input-suffix">
              <input
                id="perdas"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={settings.perdas_calibracao_un ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, perdas_calibracao_un: e.target.value }))}
              />
              <span className="suffix">mt</span>
            </div>
            <small>Unidades extras produzidas para calibrar a máquina</small>
          </div>

          <div className="settings-field">
            <label htmlFor="alca">Uso alça (cm)</label>
            <div className="input-suffix">
              <input
                id="alca"
                type="number"
                min="0"
                step="0.1"
                placeholder="0.0"
                value={settings.tamanho_alca ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, tamanho_alca: e.target.value }))}
              />
              <span className="suffix">cm</span>
            </div>
            <small>Altura fixa em cm que será somada quando "Incluir alça" estiver marcado</small>
          </div>

          <div className="settings-field">
            <label htmlFor="custo_cordao">Custo cordão (mt)</label>
            <div className="input-suffix">
              <input
                id="custo_cordao"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={settings.custo_cordao ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, custo_cordao: e.target.value }))}
              />
              <span className="suffix">R$</span>
            </div>
            <small>Custo do cordão por metro quando "Incluir cordão" estiver marcado</small>
          </div>

          <div className="settings-field">
            <label htmlFor="ipi">IPI (%)</label>
            <div className="input-suffix">
              <input
                id="ipi"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={settings.ipi_percentual ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, ipi_percentual: e.target.value }))}
              />
              <span className="suffix">%</span>
            </div>
            <small>Percentual de IPI a ser aplicado</small>
          </div>
        </div>

      </div>

      <div className="settings-card">
        <h3 style={{marginTop:0}}>Serviços</h3>
        <p className="settings-sub" style={{marginTop:4}}>
          Cadastre serviços como Silk e os impostos aplicados sobre eles. O valor será calculado como NF de serviço
          (fora das taxas do produto) e somado ao total final apenas como serviço.
        </p>
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Valor (R$)</th>
                <th>Imposto (%)</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((svc) => (
                <tr key={svc.id}>
                  <td>
                    <input
                      placeholder="Ex.: Silk"
                      value={svc.nome}
                      onChange={(e) => setServicos((list) => list.map((s) => s.id === svc.id ? { ...s, nome: e.target.value } : s))}
                    />
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={svc.valor}
                        onChange={(e) => setServicos((list) => list.map((s) => s.id === svc.id ? { ...s, valor: e.target.value } : s))}
                      />
                      <span className="suffix">R$</span>
                    </div>
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={svc.imposto_percentual ?? ''}
                        onChange={(e) => setServicos((list) => list.map((s) => s.id === svc.id ? { ...s, imposto_percentual: e.target.value } : s))}
                      />
                      <span className="suffix">%</span>
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn-icon danger"
                        onClick={() => removerServico(svc.id)}
                        type="button"
                        aria-label={`Excluir ${svc.nome}`}
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
                  <input
                    placeholder="Novo serviço"
                    value={novoServico.nome}
                    onChange={(e)=>setNovoServico((n)=>({...n, nome:e.target.value }))}
                  />
                </td>
                <td>
                  <div className="input-suffix">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={novoServico.valor}
                      onChange={(e)=>setNovoServico((n)=>({...n, valor:e.target.value }))}
                    />
                    <span className="suffix">R$</span>
                  </div>
                </td>
                <td>
                  <div className="input-suffix">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={novoServico.imposto_percentual}
                      onChange={(e)=>setNovoServico((n)=>({...n, imposto_percentual:e.target.value }))}
                    />
                    <span className="suffix">%</span>
                  </div>
                </td>
                <td>
                  <button
                    className="btn-ghost small"
                    type="button"
                    onClick={()=>{ if(!novoServico.nome) return; setServicos((list)=>[...list, { nome: novoServico.nome, valor: novoServico.valor, imposto_percentual: novoServico.imposto_percentual }]); setNovoServico({ nome: 'Silk', valor: '', imposto_percentual: '' }); }}
                  >Adicionar</button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="settings-card">
        <h3 style={{marginTop:0}}>Custos Adicionais</h3>
        <p className="settings-sub" style={{marginTop:4}}>
          Cadastre custos extras cobrados por quantidade (ex: 1 caixa a cada 300 un.).
        </p>
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th style={{width:'30%'}}>Nome</th>
                <th style={{width:'20%'}}>Valor (R$)</th>
                <th style={{width:'20%'}}>A cada (un.)</th>
                <th style={{width:'15%', textAlign:'center'}}>Mín. 1</th>
                <th style={{width:'15%'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {custosAdicionais.map((custo) => (
                <tr key={custo.id}>
                  <td>
                    <input
                      placeholder="Ex.: Caixa"
                      value={custo.nome}
                      onChange={(e) => setCustosAdicionais((list) => list.map((c) => c.id === custo.id ? { ...c, nome: e.target.value } : c))}
                    />
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={custo.valor}
                        onChange={(e) => setCustosAdicionais((list) => list.map((c) => c.id === custo.id ? { ...c, valor: e.target.value } : c))}
                      />
                      <span className="suffix">R$</span>
                    </div>
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="300"
                        value={custo.a_cada || 1}
                        onChange={(e) => setCustosAdicionais((list) => list.map((c) => c.id === custo.id ? { ...c, a_cada: e.target.value } : c))}
                      />
                      <span className="suffix">un.</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={custo.min_1 !== false}
                      onChange={(e) => setCustosAdicionais((list) => list.map((c) => c.id === custo.id ? { ...c, min_1: e.target.checked } : c))}
                      title="Sempre cobrar no mínimo 1"
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn-icon danger"
                        onClick={() => removerCustoAdicional(custo.id)}
                        type="button"
                        aria-label={`Excluir ${custo.nome}`}
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
                  <input
                    placeholder="Novo custo"
                    value={novoCusto.nome}
                    onChange={(e) => setNovoCusto((n) => ({ ...n, nome: e.target.value }))}
                  />
                </td>
                <td>
                  <div className="input-suffix">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={novoCusto.valor}
                      onChange={(e) => setNovoCusto((n) => ({ ...n, valor: e.target.value }))}
                    />
                    <span className="suffix">R$</span>
                  </div>
                </td>
                <td>
                  <div className="input-suffix">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="300"
                      value={novoCusto.a_cada || 1}
                      onChange={(e) => setNovoCusto((n) => ({ ...n, a_cada: e.target.value }))}
                    />
                    <span className="suffix">un.</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={novoCusto.min_1 !== false}
                    onChange={(e) => setNovoCusto((n) => ({ ...n, min_1: e.target.checked }))}
                    title="Sempre cobrar no mínimo 1"
                    style={{ width: 18, height: 18 }}
                  />
                </td>
                <td>
                  <button
                    className="btn-ghost small"
                    type="button"
                    onClick={() => {
                      if (!novoCusto.nome) return;
                      setCustosAdicionais((list) => [
                        ...list,
                        { nome: novoCusto.nome, valor: novoCusto.valor, a_cada: parseInt(novoCusto.a_cada) || 1, min_1: novoCusto.min_1 !== false }
                      ]);
                      setNovoCusto({ nome: '', valor: '', a_cada: 1, min_1: true });
                    }}
                  >
                    Adicionar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="settings-card">
        <h3 style={{marginTop:0}}>Impostos fixos</h3>
  <p className="settings-sub" style={{marginTop:4}}>Altere apenas os percentuais dos impostos fixos (não é possível excluir ou criar novos).</p>

        {error && <div className="calc-error" style={{color:'#b30000', marginBottom:10}}>{error}</div>}
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Percentual</th>
              </tr>
            </thead>
            <tbody>
              {impostos.map((imp) => (
                <tr key={imp.id}>
                  <td>
                    <input
                      value={imp.nome}
                      readOnly
                      disabled
                      style={{backgroundColor:'#f3f4f6'}}
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
                </tr>
              ))}
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
