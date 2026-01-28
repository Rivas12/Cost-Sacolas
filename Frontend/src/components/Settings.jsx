import React, { useEffect, useState } from 'react';
import './Settings.css';
import { useSettings } from '../context/SettingsContext';

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const [impostos, setImpostos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', imposto_percentual: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const API = {
    LISTAR: '/api/impostos_fixos',
  CRIAR: '/api/impostos_fixos',
  ATUALIZAR: (id) => `/api/impostos_fixos/${id}`,
    SERVICOS_LISTAR: '/api/servicos',
    SERVICOS_CRIAR: '/api/servicos',
    SERVICOS_ATUALIZAR: (id) => `/api/servicos/${id}`,
    SERVICOS_DELETAR: (id) => `/api/servicos/${id}`,
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
        const [resImp, resCfg, resServ] = await Promise.all([
          fetch(API.LISTAR),
          fetch(API.CONFIG_GET),
          fetch(API.SERVICOS_LISTAR).catch((e)=>e),
        ]);

        const dataImp = await resImp.json();
        const dataCfg = await resCfg.json();
  let dataServ = [];
  try { dataServ = await resServ.json(); } catch (e) { dataServ = []; }

        if (!resImp.ok) throw new Error(dataImp?.error || 'Erro ao buscar impostos');
        if (!resCfg.ok) throw new Error(dataCfg?.error || 'Erro ao buscar configurações');
        if (!resServ.ok) throw new Error((dataServ && dataServ.error) || 'Erro ao buscar serviços');

        setImpostos(Array.isArray(dataImp) ? dataImp : []);
        const listaServicos = Array.isArray(dataServ) ? dataServ : [];
        setServicos(listaServicos);
        // Não traz mais valor_silk para o contexto; serviços serão marcados manualmente
        // Aplica configurações do servidor
        if (dataCfg) {
          setSettings((s) => ({
            ...s,
            margem: dataCfg.margem ?? s.margem,
            outros_custos: dataCfg.outros_custos ?? s.outros_custos,
            perdas_calibracao_un: dataCfg.perdas_calibracao_un ?? s.perdas_calibracao_un ?? 0,
            tamanho_alca: dataCfg.tamanho_alca ?? s.tamanho_alca ?? 0,
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
    const res = await fetch(API.ATUALIZAR(imp.id), {
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
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao salvar serviço');
    if (isNovo) setServicos((list) => [...list, data]);
    else setServicos((list) => list.map((i) => (i.id === svc.id ? { ...i, ...payload } : i)));
  };

  const removerServico = async (id) => {
    setError('');
    const res = await fetch(API.SERVICOS_DELETAR(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Falha ao excluir serviço');
    setServicos((list) => list.filter((i) => i.id !== id));
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
        tamanho_alca: parseFloat(settings.tamanho_alca || 0),
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
  const { valor_silk: _ignoredSilk, ...cfgRetornada } = dataCfg || {};
  setSettings((s) => ({ ...s, ...cfgRetornada }));
  try { localStorage.setItem('cost-settings', JSON.stringify({ ...settings, ...cfgRetornada })); } catch {}

      // Atualiza todos os existentes
      const updates = impostos
        .filter((imp) => !!imp.id)
        .map(async (imp) => {
          const payload = { valor: toNumber(imp.valor) };
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

      // Atualiza/insere serviços
      const svcUpdates = servicos
        .filter((svc) => !!svc.id)
        .map(async (svc) => {
          const payload = {
            nome: svc.nome,
            valor: toNumber(svc.valor),
            imposto_percentual: toNumber(svc.imposto_percentual ?? svc.imposto ?? svc.impostos),
          };
          const res = await fetch(API.SERVICOS_ATUALIZAR(svc.id), {
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
        const resNovo = await fetch(API.SERVICOS_CRIAR, {
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
        const resNovo = await fetch(API.SERVICOS_CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadNovo),
        });
        const dataNovo = await resNovo.json();
        if (!resNovo.ok) throw new Error(dataNovo?.error || `Falha ao adicionar ${novoServico.nome}`);
        setNovoServico({ nome: 'Silk', valor: '', imposto_percentual: '' });
      }

      // Recarrega a lista para refletir ids e valores corretos
      try {
        const resList = await fetch(API.LISTAR);
        const dataList = await resList.json();
        if (resList.ok) setImpostos(Array.isArray(dataList) ? dataList : []);
        const resSvc = await fetch(API.SERVICOS_LISTAR);
        const dataSvc = await resSvc.json();
        if (resSvc.ok) setServicos(Array.isArray(dataSvc) ? dataSvc : []);
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
              value={settings.perdas_calibracao_un ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, perdas_calibracao_un: e.target.value }))}
            />
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
                <th style={{textAlign:'left'}}>Serviço</th>
                <th className="num">Valor (R$)</th>
                <th className="num">Imposto (%)</th>
                <th style={{width:90, textAlign:'left'}}>Ações</th>
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
        <h3 style={{marginTop:0}}>Impostos fixos</h3>
  <p className="settings-sub" style={{marginTop:4}}>Altere apenas os percentuais dos impostos fixos (não é possível excluir ou criar novos).</p>

        {error && <div className="calc-error" style={{color:'#b30000', marginBottom:10}}>{error}</div>}
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Nome</th>
                <th className="num">Percentual</th>
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
