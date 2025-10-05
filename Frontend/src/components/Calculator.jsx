import React, { useEffect, useMemo, useState } from 'react';
import './Calculator.css';
import { useSettings } from '../context/SettingsContext';

// Endpoints (paths) e helpers de request com fallback
const API_PATHS = {
  GRAMATURAS: '/gramaturas',
  ICMS: '/icms_estados',
  CALCULAR: '/calcular_preco',
};

const API_BASES = [
  '/api',
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:5000/api',
];

async function fetchJson(path, options) {
  let lastError;
  for (const base of API_BASES) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, options);
      // Retorna direto se OK
      if (res.ok) return res.json();
      // Guarda erro e tenta próximo base
      lastError = new Error(`${res.status} ${res.statusText} em ${url}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Falha na requisição');
}

export default function Calculator() {
  const { settings } = useSettings();
  // Opções carregadas da API
  const [gramaturas, setGramaturas] = useState([]);
  const [estados, setEstados] = useState([]);

  // Form state
  const [form, setForm] = useState({
    gramatura_id: '',
    largura_cm: '',
    altura_cm: '',
    comissao: '1',
    quantidade: '1000',
    estado: 'SP',
    cliente_tem_ie: true,
    incluir_valor_silk: false,
  });

  // Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [authed, setAuthed] = useState(false);
  const [showEtapas, setShowEtapas] = useState(false);

  // Usa a mesma sessão de autenticação do app
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('auth_ok');
      if (v === '1') {
        setAuthed(true);
        setShowEtapas(true);
      }
    } catch {}
  }, []);

  const desbloquearEtapas = () => {
    if (authed) { setShowEtapas(true); return; }
    const pwd = window.prompt('Digite a senha para ver as etapas detalhadas:');
    if (pwd === null) return;
    const APPROVAL_PWD = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APPROVAL_PASSWORD) || 'admin';
    if (pwd === APPROVAL_PWD) {
      setAuthed(true);
      setShowEtapas(true);
      try { sessionStorage.setItem('auth_ok', '1'); } catch {}
    } else {
      window.alert('Senha incorreta.');
    }
  };

  // Carrega gramaturas e estados
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        setError('');
        const [gData, eData] = await Promise.all([
          fetchJson(API_PATHS.GRAMATURAS),
          fetchJson(API_PATHS.ICMS),
        ]);
        if (!cancelled) {
          setGramaturas(gData || []);
          const estadosOrdenados = (eData || [])
            .map((e) => e.estado)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
          // Garante SP presente
          if (!estadosOrdenados.includes('SP')) estadosOrdenados.unshift('SP');
          setEstados(estadosOrdenados);
        }
      } catch (err) {
        if (!cancelled) setError('Não foi possível carregar opções. Verifique a API.');
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handlers
  const update = (field) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const canSubmit = useMemo(() => {
    return (
      form.gramatura_id &&
      parseFloat(form.largura_cm) > 0 &&
      parseInt(form.quantidade) > 0 &&
      form.estado
    );
  }, [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const payload = {
        gramatura_id: form.gramatura_id ? Number(form.gramatura_id) : undefined,
        largura_cm: parseFloat(form.largura_cm),
        margem: parseFloat(settings.margem || '0'),
        comissao: parseFloat(form.comissao || '0'),
        outros_custos: parseFloat(settings.outros_custos || '0'),
        quantidade: parseInt(form.quantidade || '1'),
        estado: form.estado,
        cliente_tem_ie: Boolean(form.cliente_tem_ie),
        perdas_calibracao_un: parseInt(settings.perdas_calibracao_un || 0),
        incluir_valor_silk: Boolean(form.incluir_valor_silk),
        valor_silk: parseFloat(settings.valor_silk || 0),
      };

      const data = await fetchJson(API_PATHS.CALCULAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setResultado(data);
    } catch (err) {
      setError(err.message || 'Erro ao calcular');
    } finally {
      setLoading(false);
    }
  };

  const resetar = () => {
    setResultado(null);
    setError('');
    setSendMsg('');
  };

  const enviarAprovacao = async () => {
    if (!resultado) return;
    setSending(true); setSendMsg('');
    try {
      // Envia altura apenas para a mensagem de aprovação (não impacta o cálculo)
      const payload = {
        cotacao: {
          ...resultado,
          altura_cm: form.altura_cm ? parseFloat(form.altura_cm) : undefined,
        },
      };
      const data = await fetchJson(API_PATHS.CALCULAR.replace('/calcular_preco', '/aprovacao/enviar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSendMsg(data?.message || 'Enviado.');
    } catch (e) {
      setSendMsg(e.message || 'Falha ao enviar.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="calc-wrap">
  <h2 className="calc-title">Calculadora de Preço</h2>
  <p className="calc-sub">Preencha os campos abaixo para estimar o preço final considerando impostos, margem e demais custos.</p>

      <form className="calc-card" onSubmit={handleSubmit}>
        <div className="calc-grid">
          <div className="calc-field">
            <label>Gramatura</label>
            <select value={form.gramatura_id} onChange={update('gramatura_id')} required>
              <option value="">Selecione</option>
              {gramaturas.map((g) => (
                <option key={g.id} value={g.id}>{g.gramatura}</option>
              ))}
            </select>
          </div>

          <div className="calc-field">
            <label>Largura (cm)</label>
            <input type="number" step="0.01" min="0" placeholder="Ex.: 40" value={form.largura_cm} onChange={update('largura_cm')} required />
          </div>

          <div className="calc-field">
            <label>Altura (cm)</label>
            <input type="number" step="0.01" min="0" placeholder="Ex.: 50" value={form.altura_cm} onChange={update('altura_cm')} />
          </div>

          <div className="calc-field">
            <label>Comissão (%)</label>
            <input type="number" step="0.01" min="0" placeholder="0" value={form.comissao} onChange={update('comissao')} />
          </div>

          {/* Margem e Outros Custos agora estão nas Configurações globais */}

          <div className="calc-field">
            <label>Quantidade</label>
            <input type="number" min="1" step="1" placeholder="ex.: 1000" value={form.quantidade} onChange={update('quantidade')} />
          </div>

          <div className="calc-field">
            <label>Estado</label>
            <select value={form.estado} onChange={update('estado')} required>
              {estados.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>

          {form.estado && form.estado.toUpperCase() !== 'SP' && (
            <div className="calc-field checkbox">
              <label>
                <input type="checkbox" checked={form.cliente_tem_ie} onChange={update('cliente_tem_ie')} />
                Cliente tem IE?
              </label>
            </div>
          )}

          <div className="calc-field checkbox">
            <label>
              <input type="checkbox" checked={form.incluir_valor_silk} onChange={update('incluir_valor_silk')} />
              Incluir Silk
            </label>
          </div>
        </div>

        <div className="calc-actions">
          <button type="submit" className="btn-primary" disabled={!canSubmit || loading}>
            {loading ? 'Calculando...' : 'Calcular preço'}
          </button>
          {resultado && (
            <button type="button" className="btn-ghost" onClick={enviarAprovacao} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar para aprovação'}
            </button>
          )}
        </div>

        {sendMsg && <div className="calc-sub" style={{marginTop:8}}>{sendMsg}</div>}

        {error && <div className="calc-error">{error}</div>}
      </form>

      {resultado && (
        <div className="result-card">
          <div className="result-head">
            <div>
              <h3>Resultado</h3>
              <p>Gramatura: <strong>{resultado.gramatura_nome}</strong> • Largura: <strong>{resultado.largura_cm} cm</strong></p>
            </div>
            <div className="result-highlight">
              <span>Preço final</span>
              <strong>R$ {resultado.preco_final.toFixed(2)}</strong>
            </div>
          </div>

          <div className="result-grid">
            <div className="result-box"><span>Valor unitário</span><strong>R$ {(resultado.preco_final / (resultado.quantidade )).toFixed(2)}</strong></div>
            <div className="result-box"><span>Quantidade</span><strong>{resultado.quantidade}</strong></div>
            <div className="result-box"><span>Comissão total</span><strong>R$ {resultado.valor_comissao.toFixed(2)}</strong></div>
            <div className="result-box"><span>Valor total</span><strong>R$ {resultado.preco_final.toFixed(2)}</strong></div>
          </div>

          {showEtapas ? (
            <>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Etapas</th>
                    <th>Percentual</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Perdas (calibração)</td>
                    <td>
                      {(() => {
                        const perdasUn = Math.max(0, Number(resultado.quantidade_total || 0) - Number(resultado.quantidade || 0));
                        const perdasVal = perdasUn * Number(resultado.custo_real || 0);
                        const denom = Number(resultado.preco_final || 0);
                        const pct = denom > 0 ? (perdasVal / denom) * 100 : 0;
                        return `${pct.toFixed(2)}%`;
                      })()}
                    </td>
                    <td>
                      R$ {(
                        (Number(resultado.quantidade_total || 0) - Number(resultado.quantidade || 0))
                        * Number(resultado.custo_real || 0)
                      ).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td>Margem</td>
                    <td>{resultado.margem_percentual}%</td>
                    <td>R$ {resultado.valor_margem.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td>Comissão</td>
                    <td>{resultado.comissao_percentual}%</td>
                    <td>R$ {resultado.valor_comissao.toFixed(2)}</td>
                  </tr>
                  {Array.isArray(resultado.impostos_fixos_detalhe) && resultado.impostos_fixos_detalhe.length > 0 && (
                    resultado.impostos_fixos_detalhe.map((imp, idx) => {
                      const pct = Number(imp.percentual || 0);
                      const val = Number(resultado.preco_final || 0) * (pct / 100);
                      return (
                        <tr key={`imp-${idx}`}>
                          <td> {imp.nome}</td>
                          <td>{pct.toFixed(2)}%</td>
                          <td>R$ {val.toFixed(2)}</td>
                        </tr>
                      );
                    })
                  )}
                  <tr>
                    <td>ICMS</td>
                    <td>{resultado.icms_percentual}%</td>
                    <td>R$ {resultado.valor_icms.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td>Outros custos</td>
                    <td>{resultado.outros_custos_percentual}%</td>
                    <td>R$ {resultado.valor_outros.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>


               {resultado.incluir_valor_silk ? (
                <table className="result-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Extras</th>
                      <th>—</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Silk por unidade</td>
                      <td>Incluído</td>
                      <td>R$ {Number(resultado.valor_silk_unitario || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Silk total</td>
                      <td>Incluído</td>
                      <td>R$ {Number((resultado.valor_silk_total ?? resultado.valor_silk) || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : null}

            </>
          ) : (
            <div className="locked-card" onClick={desbloquearEtapas} title="Desbloquear etapas">
              <span className="lock-icon">🔒</span>
              <div>
                <strong>Etapas bloqueadas</strong>
                <div style={{ color:'#6b7280', fontWeight: 400 }}>Clique para inserir a senha e ver o detalhamento.</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
