import React, { useEffect, useState } from 'react';
import './Settings.css';
import { useSettings } from '../context/SettingsContext';
import { apiFetch, apiJson } from '../utils/apiClient';

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
    LISTAR: '/impostos_fixos',
  CRIAR: '/impostos_fixos',
  ATUALIZAR: (id) => `/impostos_fixos/${id}`,
    SERVICOS_LISTAR: '/servicos',
    SERVICOS_CRIAR: '/servicos',
    SERVICOS_ATUALIZAR: (id) => `/servicos/${id}`,
    SERVICOS_DELETAR: (id) => `/servicos/${id}`,
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
        // Busca impostos e configurações em paralelo
        const [dataImp, dataCfg, dataServ] = await Promise.all([
          apiJson(API.LISTAR),
          apiJson(API.CONFIG_GET),
          apiJson(API.SERVICOS_LISTAR).catch((e) => []),
        ]);

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

      // Recarrega a lista para refletir ids e valores corretos
      try {
        const dataList = await apiJson(API.LISTAR);
        setImpostos(Array.isArray(dataList) ? dataList : []);
        const dataSvc = await apiJson(API.SERVICOS_LISTAR);
        setServicos(Array.isArray(dataSvc) ? dataSvc : []);
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
            <label htmlFor="valor_cordao">Valor cordão (mt)</label>
            <div className="input-suffix">
              <input
                id="valor_cordao"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={settings.valor_cordao ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, valor_cordao: e.target.value }))}
              />
              <span className="suffix">R$</span>
            </div>
            <small>Valor do cordão por metro quando "Incluir cordão" estiver marcado</small>
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

      <div className="settings-card">
        <ItensAdicionaisInline />
      </div>
    </div>
  );
}

// Itens Adicionais inline (sem arquivo separado)
function ItensAdicionaisInline() {
  const ITENS_PADRAO = [
    { id: 'caixa', nome: 'Caixa', valor: 15.00, a_cada: 300, minimo_1: true },
  ];

  const [itens, setItens] = useState(() => {
    try {
      const saved = localStorage.getItem('itens_adicionais');
      return saved ? JSON.parse(saved) : ITENS_PADRAO;
    } catch {
      return ITENS_PADRAO;
    }
  });

  const [novoItem, setNovoItem] = useState({ nome: '', valor: '', a_cada: '', minimo_1: true });

  const salvarNoStorage = (lista) => {
    try { localStorage.setItem('itens_adicionais', JSON.stringify(lista)); } catch {}
  };

  const adicionarItem = () => {
    if (!novoItem.nome) return;
    const novo = {
      id: `item_${Date.now()}`,
      nome: novoItem.nome,
      valor: parseFloat(novoItem.valor) || 0,
      a_cada: parseInt(novoItem.a_cada) || 1,
      minimo_1: novoItem.minimo_1,
    };
    const novaLista = [...itens, novo];
    setItens(novaLista);
    salvarNoStorage(novaLista);
    setNovoItem({ nome: '', valor: '', a_cada: '', minimo_1: true });
  };

  const atualizarItem = (id, campo, valor) => {
    const novaLista = itens.map((item) => {
      if (item.id !== id) return item;
      if (campo === 'nome') return { ...item, nome: valor };
      if (campo === 'a_cada') return { ...item, a_cada: parseInt(valor) || 0 };
      if (campo === 'minimo_1') return { ...item, minimo_1: valor };
      return { ...item, valor: parseFloat(valor) || 0 };
    });
    setItens(novaLista);
    salvarNoStorage(novaLista);
  };

  const removerItem = (id) => {
    const novaLista = itens.filter((item) => item.id !== id);
    setItens(novaLista);
    salvarNoStorage(novaLista);
  };

  return (
    <>
      <h3 style={{ marginTop: 0 }}>Itens Adicionais</h3>
      <p className="settings-sub" style={{ marginTop: 4 }}>
        Cadastre itens extras cobrados por quantidade (ex: 1 caixa a cada 300 un.). Salvos localmente.
      </p>
      <table className="result-table">
        <thead>
          <tr>
            <th style={{ width: '35%' }}>Nome</th>
            <th style={{ width: '20%' }}>Valor (R$)</th>
            <th style={{ width: '20%' }}>A cada (un.)</th>
            <th style={{ width: '10%', textAlign: 'center' }}>Mín. 1</th>
            <th style={{ width: '15%' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              <td>
                <input placeholder="Ex.: Caixa" value={item.nome} onChange={(e) => atualizarItem(item.id, 'nome', e.target.value)} />
              </td>
              <td>
                <div className="input-suffix">
                  <input type="number" step="0.01" min="0" placeholder="0,00" value={item.valor} onChange={(e) => atualizarItem(item.id, 'valor', e.target.value)} />
                  <span className="suffix">R$</span>
                </div>
              </td>
              <td>
                <div className="input-suffix">
                  <input type="number" step="1" min="1" placeholder="300" value={item.a_cada} onChange={(e) => atualizarItem(item.id, 'a_cada', e.target.value)} />
                  <span className="suffix">un.</span>
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={item.minimo_1 ?? true} 
                  onChange={(e) => atualizarItem(item.id, 'minimo_1', e.target.checked)} 
                  title="Sempre cobrar no mínimo 1" 
                  style={{ width: 18, height: 18 }}
                />
              </td>
              <td>
                <div className="table-actions">
                  <button className="btn-icon danger" onClick={() => removerItem(item.id)} type="button" title="Excluir">🗑️</button>
                </div>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input placeholder="Novo item" value={novoItem.nome} onChange={(e) => setNovoItem((n) => ({ ...n, nome: e.target.value }))} />
            </td>
            <td>
              <div className="input-suffix">
                <input type="number" step="0.01" min="0" placeholder="0,00" value={novoItem.valor} onChange={(e) => setNovoItem((n) => ({ ...n, valor: e.target.value }))} />
                <span className="suffix">R$</span>
              </div>
            </td>
            <td>
              <div className="input-suffix">
                <input type="number" step="1" min="1" placeholder="300" value={novoItem.a_cada} onChange={(e) => setNovoItem((n) => ({ ...n, a_cada: e.target.value }))} />
                <span className="suffix">un.</span>
              </div>
            </td>
            <td style={{ textAlign: 'center' }}>
              <input 
                type="checkbox" 
                checked={novoItem.minimo_1} 
                onChange={(e) => setNovoItem((n) => ({ ...n, minimo_1: e.target.checked }))} 
                title="Sempre cobrar no mínimo 1" 
                style={{ width: 18, height: 18 }}
              />
            </td>
            <td>
              <button className="btn-ghost small" type="button" onClick={adicionarItem}>Adicionar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
