import React, { useEffect, useMemo, useState } from 'react';
import './Calculator.css';
import { useSettings } from '../context/SettingsContext';
import { apiJson, apiFetch } from '../utils/apiClient';

// Endpoints (paths)
const API_PATHS = {
  GRAMATURAS: '/gramaturas',
  CALCULAR: '/calcular_preco',
  SERVICOS: '/servicos',
};

const ESTADOS_BR = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function Calculator({ onOpenBatch }) {
  const { settings } = useSettings();
  // Opções carregadas da API
  const [gramaturas, setGramaturas] = useState([]);
  const [estados, setEstados] = useState(ESTADOS_BR);
  const [servicos, setServicos] = useState([]);
  const [valorSilkServico, setValorSilkServico] = useState(null);
  const [servicosSelecionados, setServicosSelecionados] = useState([]);

  // Itens adicionais (carregados do localStorage, sempre cobrados)
  const [itensAdicionais, setItensAdicionais] = useState([]);

  // Form state
  const [form, setForm] = useState({
    gramatura_id: '',
    largura_cm: '',
    altura_cm: '',
    comissao: '1',
    quantidade: '2000',
    estado: 'SP',
    cliente_tem_ie: false,
    incluir_valor_silk: false,
    incluir_lateral: false,
    incluir_alca: true,
    incluir_fundo: false,
    cortar_tecido: false,
    incluir_cordao: false,
    lateral_cm: '',
    fundo_cm: '',
  });

  // Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  // Snapshot of form/settings at the time of the last calculation — used to freeze aproveitamento
  const [calcSnapshot, setCalcSnapshot] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [authed, setAuthed] = useState(false);
  const [showEtapas, setShowEtapas] = useState(false);
  const [showAproveitamento, setShowAproveitamento] = useState(false);
  const [showUnitarioComIpi, setShowUnitarioComIpi] = useState(true);
  // Modal de senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Quando um resultado novo chega, avisa por alert se a altura efetiva por unidade exceder a bobina
  useEffect(() => {
    if (!resultado) return;
    try {
      const bobinaAlt = Number(resultado.gramatura_altura_cm || 0);
      // use snapshot of inputs from last Calculate when available
      const sourceForm = calcSnapshot?.form ?? form;
      const sourceSettings = calcSnapshot?.settings ?? settings;
      const alturaProd = Number(sourceForm.altura_cm ?? resultado.altura_produto_cm ?? 0);
      const includeFundo = Boolean(sourceForm.incluir_fundo) || Boolean(resultado.incluir_fundo);
      const fundo = includeFundo ? Number(sourceForm.fundo_cm ?? resultado.fundo_cm ?? 0) : 0;
      const alcaVal = Number(sourceSettings.tamanho_alca ?? resultado.tamanho_alca ?? resultado.valor_alca ?? 0);
      const includeAlca = Boolean(sourceForm.incluir_alca) || Boolean(resultado.incluir_alca);
      const alca = includeAlca ? alcaVal : 0;
      const alturaEfetiva = (alturaProd * 2) + fundo + alca;
      if (bobinaAlt > 0 && alturaEfetiva > bobinaAlt) {
        window.alert(`Atenção: altura efetiva por unidade (${alturaEfetiva.toFixed(2)} cm) ultrapassa a altura disponível da bobina (${bobinaAlt} cm). Ajuste a altura do produto ou escolha outra gramatura.`);
      }
    } catch (e) {
      // ignore
    }
  }, [resultado, calcSnapshot]);

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

  const APP_PASSWORD = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_PASSWORD) || 'admin';

  const desbloquearEtapas = () => {
    if (authed) { setShowEtapas(true); return; }
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handleConfirmPassword = () => {
    if (passwordInput === APP_PASSWORD) {
      setAuthed(true);
      setShowEtapas(true);
      try { sessionStorage.setItem('auth_ok', '1'); } catch {}
      setShowPasswordModal(false);
      setPasswordError('');
    } else {
      setPasswordError('Senha incorreta.');
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordError('');
    setPasswordInput('');
  };

  // Carrega gramaturas e estados
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        setError('');
        const [gData, sData] = await Promise.all([
          apiJson(API_PATHS.GRAMATURAS),
          apiJson(API_PATHS.SERVICOS).catch(() => []),
        ]);
        if (!cancelled) {
          setGramaturas(gData || []);
          setEstados(ESTADOS_BR);
          const listaServicos = Array.isArray(sData) ? sData : [];
          setServicos(listaServicos);
          const silk = listaServicos.find((s) => String(s.nome || '').toLowerCase().includes('silk'));
          if (silk && silk.valor !== undefined && silk.valor !== null && silk.valor !== '') {
            setValorSilkServico(Number(silk.valor) || 0);
          }
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

  // Carrega itens adicionais do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('itens_adicionais');
      if (saved) {
        setItensAdicionais(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Calcula totais dos itens adicionais (sempre inclui todos automaticamente)
  const calcularItensAdicionais = useMemo(() => {
    const quantidade = parseInt(form.quantidade || '0');
    if (quantidade <= 0 || itensAdicionais.length === 0) return { itens: [], total: 0 };

    const itensCalculados = itensAdicionais.map((item) => {
      const aCada = parseInt(item.a_cada) || 1;
      const valor = parseFloat(item.valor) || 0;
      const minimo1 = item.minimo_1 !== false; // default true
      let quantidadeItens = Math.ceil(quantidade / aCada);
      if (minimo1 && quantidadeItens < 1) quantidadeItens = 1;
      const valorTotal = quantidadeItens * valor;
      return {
        ...item,
        quantidade_calculada: quantidadeItens,
        valor_total: valorTotal,
      };
    });

    const total = itensCalculados.reduce((acc, item) => acc + item.valor_total, 0);
    return { itens: itensCalculados, total };
  }, [itensAdicionais, form.quantidade]);

  // Handlers
  const update = (field) => (e) => {
    const isCheckbox = e?.target?.type === 'checkbox';
    const value = isCheckbox ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Quando desmarca incluir_lateral, incluir_fundo, zera o valor do campo correspondente
      if (isCheckbox && !value) {
        if (field === 'incluir_lateral') next.lateral_cm = '';
        if (field === 'incluir_fundo') next.fundo_cm = '';
      }
      return next;
    });
  };

  const canSubmit = useMemo(() => {
    return (
      form.gramatura_id &&
      parseFloat(form.largura_cm) > 0 &&
      parseFloat(form.altura_cm) > 0 &&
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
      const valorSilkNumber = valorSilkServico != null ? Number(valorSilkServico) : parseFloat(settings.valor_silk || 0);
      // Se cortar_tecido estiver marcado, divide a largura pela metade
      const larguraOriginal = parseFloat(form.largura_cm);
      const larguraEnviar = form.cortar_tecido ? larguraOriginal / 2 : larguraOriginal;
      const payload = {
        gramatura_id: form.gramatura_id ? Number(form.gramatura_id) : undefined,
        largura_cm: larguraEnviar,
        largura_original_cm: form.cortar_tecido ? larguraOriginal : undefined,
        cortar_tecido: Boolean(form.cortar_tecido),
        altura_cm: form.altura_cm ? parseFloat(form.altura_cm) : undefined,
        margem: parseFloat(settings.margem || '0'),
        comissao: parseFloat(form.comissao || '0'),
        quantidade: parseInt(form.quantidade || '1'),
        estado: form.estado,
        cliente_tem_ie: Boolean(form.cliente_tem_ie),
        incluir_lateral: Boolean(form.incluir_lateral),
        incluir_alca: Boolean(form.incluir_alca),
        incluir_fundo: Boolean(form.incluir_fundo),
        incluir_cordao: Boolean(form.incluir_cordao),
        lateral_cm: form.lateral_cm ? parseFloat(form.lateral_cm) : undefined,
        fundo_cm: form.fundo_cm ? parseFloat(form.fundo_cm) : undefined,
        perdas_calibracao_un: parseInt(settings.perdas_calibracao_un || 0),
        incluir_valor_silk: false,
        valor_silk: 0,
        ipi_percentual: parseFloat(settings.ipi_percentual || 0),
        servicos: (servicosSelecionados || []).map((id) => {
          const svc = servicos.find((s) => String(s.id) === String(id));
          return svc ? {
            id: svc.id,
            nome: svc.nome,
            valor: Number(svc.valor) || 0,
            imposto_percentual: Number(svc.imposto_percentual || svc.impostos || 0) || 0,
          } : null;
        }).filter(Boolean),
      };
      // Only send tamanho_alca when the option is enabled — backend will sum it into the effective height
      if (form.incluir_alca) {
        payload.tamanho_alca = parseFloat(settings.tamanho_alca || 0);
      }

      const data = await apiJson(API_PATHS.CALCULAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setResultado(data);
      // snapshot current form + settings so subsequent UI changes don't affect this result until next calculate
      setCalcSnapshot({ form: { ...form }, settings: { ...settings } });
    } catch (err) {
      setError(err.message || 'Erro ao calcular');
    } finally {
      setLoading(false);
    }
  };

  const canBatch = useMemo(() => {
    const quantidadeVal = parseInt(form.quantidade, 10);
    return Boolean(form.gramatura_id) && quantidadeVal > 0;
  }, [form.gramatura_id, form.quantidade]);

  const handleBatchPdf = async () => {
    setBatchLoading(true);
    setBatchMsg('Gerando PDF...');
    try {
      const itensSupabase = await apiJson('/sacolas_lote');
      const itens = Array.isArray(itensSupabase) ? itensSupabase : [];
      if (!itens.length) {
        window.alert('Nenhum tamanho salvo em lote. Vá em Cálculo em Lote e adicione itens (dados vêm do Supabase).');
        setBatchMsg('');
        return;
      }
      if (!form.gramatura_id) {
        window.alert('Selecione a gramatura antes de calcular em lote.');
        setBatchMsg('');
        return;
      }
      if (!form.estado) {
        window.alert('Selecione o estado antes de calcular em lote.');
        setBatchMsg('');
        return;
      }

      const contexto = {
        gramatura_id: Number(form.gramatura_id),
        margem: parseFloat(settings.margem || '0'),
        comissao: parseFloat(form.comissao || '0'),
        outros_custos: parseFloat(settings.outros_custos || '0'),
        quantidade: parseInt(form.quantidade || '1'),
        estado: form.estado,
        cliente_tem_ie: Boolean(form.cliente_tem_ie),
        incluir_valor_silk: false,
        valor_silk: undefined,
        ipi_percentual: parseFloat(settings.ipi_percentual || 0),
        servicos: (servicosSelecionados || []).map((id) => {
          const svc = servicos.find((s) => String(s.id) === String(id));
          return svc ? {
            id: svc.id,
            nome: svc.nome,
            valor: Number(svc.valor) || 0,
            imposto_percentual: Number(svc.imposto_percentual || svc.impostos || 0) || 0,
          } : null;
        }).filter(Boolean),
        perdas_calibracao_un: parseInt(settings.perdas_calibracao_un || 0),
        tamanho_alca: settings.tamanho_alca ? parseFloat(settings.tamanho_alca) : undefined,
      };

      const itensPayload = itens.map((it) => ({
        nome: it.nome || '',
        largura_cm: it.largura_cm != null ? Number(it.largura_cm) : undefined,
        altura_cm: it.altura_cm != null ? Number(it.altura_cm) : undefined,
        lateral_cm: it.lateral_cm != null && it.lateral_cm !== '' ? Number(it.lateral_cm) : undefined,
        fundo_cm: it.fundo_cm != null && it.fundo_cm !== '' ? Number(it.fundo_cm) : undefined,
        incluir_alca: Boolean(it.tem_alca ?? it.incluir_alca ?? it.alca ?? it.temAlca),
      }));

      const res = await apiFetch('/batch/pdf-precos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensPayload, contexto }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Falha ao gerar PDF em lote');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'calculo-lote-precos.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBatchMsg('PDF gerado! Verifique o download.');
    } catch (err) {
      setBatchMsg('');
      window.alert(err?.message || 'Erro ao gerar PDF em lote.');
    } finally {
      setBatchLoading(false);
    }
  };

  const resetar = () => {
    setResultado(null);
    setError('');
    setSendMsg('');
    setCalcSnapshot(null);
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
          lateral_cm: form.lateral_cm ? parseFloat(form.lateral_cm) : undefined,
          fundo_cm: form.fundo_cm ? parseFloat(form.fundo_cm) : undefined,
        },
      };
      const data = await apiJson(API_PATHS.CALCULAR.replace('/calcular_preco', '/aprovacao/enviar'), {
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
          <div className="calc-field gramatura-field">
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
            <input type="number" step="0.01" min="0" placeholder="Ex.: 50" value={form.altura_cm} onChange={update('altura_cm')} required />
          </div>

          <div className="calc-field">
            <label>Comissão (%)</label>
            <input type="number" step="0.01" min="0" placeholder="0" value={form.comissao} onChange={update('comissao')} />
          </div>

          {/* Campos condicionais para Lateral e Fundo (aparecem só se as checkboxes estiverem marcadas) */}
          {form.incluir_lateral && (
            <div className="calc-field">
              <label>Lateral (cm)</label>
              <input type="number" step="0.1" min="0" placeholder="Ex.: 5" value={form.lateral_cm} onChange={update('lateral_cm')} />
            </div>
          )}

          {form.incluir_fundo && (
            <div className="calc-field">
              <label>Fundo (cm)</label>
              <input type="number" step="0.1" min="0" placeholder="Ex.: 6" value={form.fundo_cm} onChange={update('fundo_cm')} />
            </div>
          )}

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

          {/* Cliente tem IE agora faz parte do grupo de opções abaixo */}

          {/* opções (moved below grid) */}
        </div>

        {/* Opções: exibidas abaixo de todos os inputs, em linha */}
        <div className="options-row">
          <div className="options-list">
            <label>
              <input type="checkbox" checked={form.cliente_tem_ie} onChange={update('cliente_tem_ie')} />
              Cliente tem IE?
            </label>
            <label>
              <input type="checkbox" checked={form.incluir_alca} onChange={update('incluir_alca')} />
              Incluir alça
            </label>
            <label>
              <input type="checkbox" checked={form.incluir_lateral} onChange={update('incluir_lateral')} />
              Incluir lateral
            </label>
            <label>
              <input type="checkbox" checked={form.incluir_fundo} onChange={update('incluir_fundo')} />
              Incluir fundo
            </label>
            <label title="Divide a largura do tecido pela metade (tecido cortado ao meio)">
              <input type="checkbox" checked={form.cortar_tecido} onChange={update('cortar_tecido')} />
              Cortar tecido
            </label>
            <label>
              <input type="checkbox" checked={form.incluir_cordao} onChange={update('incluir_cordao')} />
              Incluir cordão
            </label>
          </div>
        </div>

        {servicos && servicos.length > 0 && (
          <div className="services-box">
            <div className="services-head">
              <h4>Serviços (NF serviço)</h4>
              <span className="services-hint">Selecione os serviços a incluir; são somados fora das taxas do produto.</span>
            </div>
            <div className="services-list">
              {servicos.map((svc) => {
                const checked = servicosSelecionados.includes(svc.id);
                return (
                  <label key={svc.id} className="service-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setServicosSelecionados((prev) => {
                          const idStr = svc.id;
                          if (e.target.checked) return [...prev, idStr];
                          return prev.filter((p) => String(p) !== String(idStr));
                        });
                      }}
                    />
                    <span className="service-name">{svc.nome}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="calc-actions">
          <button type="submit" className="btn-primary" disabled={!canSubmit || loading}>
            {loading ? 'Calculando...' : 'Calcular preço'}
          </button>
          <button
            type="button"
            className="btn-success"
            onClick={handleBatchPdf}
            disabled={!canBatch || loading || batchLoading}
          >
            {batchLoading ? 'Gerando PDF...' : 'Calcular em lote'}
          </button>

        </div>

        {batchMsg && <div className="calc-sub" style={{marginTop:8}}>{batchMsg}</div>}

        {sendMsg && <div className="calc-sub" style={{marginTop:8}}>{sendMsg}</div>}

        {error && <div className="calc-error">{error}</div>}
      </form>

      {resultado && (
        <div className="result-card">
          <div className="result-head">
            <div>
              <h3>Resultado</h3>
              <p>
                Gramatura: <strong>{resultado.gramatura_nome}</strong> • Largura: <strong>{resultado.largura_cm} cm</strong>
                {resultado.cortar_tecido && (
                  <span title={`Largura original: ${resultado.largura_original_cm} cm (cortada ao meio)`} style={{marginLeft:8, color:'#0891b2', fontWeight:600}}>✂️ Tecido cortado</span>
                )}
              </p>
              {/* Aproveitamento exibido apenas na lista de etapas (detalhamento) */}
            </div>
            <div className="result-highlights">
              <div className="result-highlight">
                <span>Preço unitário final</span>
                <strong>R$ {(resultado.preco_final / Math.max(1, resultado.quantidade || 1)).toFixed(4)}</strong>
              </div>
              <div className="result-highlight">
                <span>Preço final</span>
                <strong>R$ {resultado.preco_final.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div className="result-grid">
            <div className="result-box">
              <span>
                {showUnitarioComIpi ? 'Valor unitário (com IPI)' : 'Valor unitário (sem IPI)'}
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowUnitarioComIpi(v => !v); }}
                  className="btn-toggle-ipi"
                  title="Clique para alternar entre com/sem IPI"
                >
                  🔄
                </button>
              </span>
              <strong>R$ {showUnitarioComIpi 
                ? Number((resultado.preco_final_produto_com_ipi || 0) / Math.max(1, resultado.quantidade || 1)).toFixed(4) 
                : Number(resultado.preco_unitario_sem_ipi || 0).toFixed(4)
              }</strong>
            </div>
            <div className="result-box"><span>Total do produto (NF produto)</span><strong>R$ {Number(resultado.preco_final_produto || 0).toFixed(2)}</strong></div>
            <div className="result-box"><span>Serviços (NF serviço)</span><strong>R$ {Number(resultado.preco_final_servicos || 0).toFixed(2)}</strong></div>
            <div className="result-box"><span>Valor IPI</span><strong>R$ {Number(resultado.valor_ipi || 0).toFixed(2)}</strong></div>
          </div>

          {/* Bloco público mostrando aproveitamento da altura (visível sem desbloquear etapas) */}
          {resultado.aproveitamento_altura_percentual != null && (
            (() => {
              const bobinaAlt = Number(resultado.gramatura_altura_cm || 0);
              // Use snapshot values from the last Calculate when available (freezes inputs until next calculate)
              const sourceForm = calcSnapshot?.form ?? form;
              const sourceSettings = calcSnapshot?.settings ?? settings;
              const alturaProd = Number(sourceForm.altura_cm ?? resultado.altura_produto_cm ?? 0);
              const includeFundo = Boolean(sourceForm.incluir_fundo) || Boolean(resultado.incluir_fundo);
              const fundo = includeFundo ? Number(sourceForm.fundo_cm ?? resultado.fundo_cm ?? 0) : 0;
              const alcaVal = Number(sourceSettings.tamanho_alca ?? resultado.tamanho_alca ?? resultado.valor_alca ?? 0);
              const includeAlca = Boolean(sourceForm.incluir_alca) || Boolean(resultado.incluir_alca);
              const alca = includeAlca ? alcaVal : 0;
              const unit = (alturaProd * 2) + fundo + alca; // altura efetiva por unidade (inclui alça/fundo quando aplicável)
              const unidades = Number(resultado.unidades_por_bobina || 0);
              const utilizada = unidades * unit; // total usado na bobina pelas unidades
              const sobra = Math.max(0, bobinaAlt - utilizada);
              const pctTotal = bobinaAlt > 0 ? (utilizada / bobinaAlt) * 100 : 0; // aproveitamento total da bobina
              const pctSobra = bobinaAlt > 0 ? (sobra / bobinaAlt) * 100 : 0;
              const pctPorUnidade = bobinaAlt > 0 ? (unit / bobinaAlt) * 100 : 0; // aproveitamento por unidade (mais informativo)

              return (
                <div className="result-public" style={{marginTop:12, padding:12, background:'#f8fafc', borderRadius:10}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                    <div>
                      <strong>Aproveitamento (altura por unidade): </strong>
                      <span style={{marginLeft:8}}>{Number(pctPorUnidade).toFixed(2)}%</span>
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{color:'#6b7280', fontSize:12}}>Bobina: {resultado.gramatura_altura_cm ?? '—'} cm</div>
                      <button type="button" className="aprove-toggle" onClick={() => setShowAproveitamento(s => !s)} aria-expanded={showAproveitamento}>
                        <span className={`caret ${showAproveitamento ? 'open' : ''}`}>▾</span>
                        <span style={{marginLeft:8, fontWeight:600, color:'#033b4b'}}>{showAproveitamento ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
                      </button>
                    </div>
                  </div>

                  {showAproveitamento && (
                    <table className="result-table" style={{ marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th>Etapas</th>
                          <th>Percentual</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        <>
                          <tr>
                            <td>Aproveitamento (altura)</td>
                            <td>{Number(pctPorUnidade).toFixed(2)}%</td>
                            <td>{unit.toFixed(2)} de {bobinaAlt ? bobinaAlt + 'cm' : ''} </td>
                          </tr>
                          {includeAlca && (
                            <tr>
                              <td>Alça</td>
                              <td>{bobinaAlt > 0 ? ((alca / (bobinaAlt || 1)) * 100).toFixed(2) + '%' : ''}</td>
                              <td>{alca.toFixed(2)} cm</td>
                            </tr>
                          )}
                          {includeFundo && (
                            <tr>
                              <td>Fundo</td>
                              <td>{bobinaAlt > 0 ? ((fundo / (bobinaAlt || 1)) * 100).toFixed(2) + '%' : ''}</td>
                              <td>{fundo.toFixed(2)} cm</td>
                            </tr>
                          )}
                          <tr>
                            <td>Largura utilizada</td>
                            <td></td>
                            <td>{resultado.largura_utilizada_cm ?? ''} cm</td>
                          </tr>
                          <tr>
                            <td>Sobra da altura</td>
                            <td>{bobinaAlt > 0 ? Number(pctSobra).toFixed(2) + '%' : ''}</td>
                            <td>{sobra.toFixed(2)} cm</td>
                          </tr>
                        </>
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()
          )}

          {showEtapas ? (
            <>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Composição do Preço Final</th>
                    <th className="num">%</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>1. Margem de Lucro</strong></td>
                    <td className="num"><strong>{resultado.margem_percentual.toFixed(2)}%</strong></td>
                    <td className="num"><strong>R$ {resultado.valor_margem.toFixed(2)}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>2. IPI</strong></td>
                    <td className="num"><strong>{resultado.ipi_percentual.toFixed(2)}%</strong></td>
                    <td className="num"><strong>R$ {resultado.valor_ipi.toFixed(2)}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>3. Impostos</strong></td>
                    <td className="num"><strong>{resultado.impostos_fixos_percentual.toFixed(2)}%</strong></td>
                    <td className="num"><strong>R$ {resultado.valor_impostos_fixos.toFixed(2)}</strong></td>
                  </tr>
                  {Array.isArray(resultado.impostos_fixos_detalhe) && resultado.impostos_fixos_detalhe
                    .filter((imp) => Number(imp.percentual || 0) > 0.0001)
                    .map((imp, idx) => {
                      const pct = Number(imp.percentual || 0);
                      // Usa o valor calculado pela API (se disponível), senão recalcula
                      const val = imp.valor !== undefined ? Number(imp.valor) : 0;
                      return (
                        <tr key={`imp-${idx}`} style={{fontSize: '0.9em'}}>
                          <td style={{paddingLeft: '40px'}}>• {imp.nome}</td>
                          <td className="num">{pct.toFixed(2)}%</td>
                          <td className="num">R$ {val.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  {(Number(resultado.desconto_percentual || 0) > 0.0001) && (
                    <tr>
                      <td><strong>Desconto</strong></td>
                      <td className="num"><strong>{resultado.desconto_percentual.toFixed(2)}%</strong></td>
                      <td className="num"><strong>-R$ {resultado.valor_desconto.toFixed(2)}</strong></td>
                    </tr>
                  )}
                  <tr>
                    <td><strong>4. Comissão ({resultado.comissao_percentual.toFixed(2)}% do total)</strong></td>
                    <td className="num"><strong>{resultado.comissao_percentual.toFixed(2)}%</strong></td>
                    <td className="num"><strong>R$ {resultado.valor_comissao.toFixed(2)}</strong></td>
                  </tr>
                  <tr style={{fontSize: '0.9em'}}>
                    <td style={{paddingLeft: '40px'}}>• Produto: R$ {Number(resultado.valor_comissao_produto || 0).toFixed(2)}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                  </tr>
                  <tr style={{fontSize: '0.9em'}}>
                    <td style={{paddingLeft: '40px'}}>• Serviços: R$ {Number(resultado.valor_comissao_servicos || 0).toFixed(2)}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                  </tr>
                  <tr style={{borderTop: '1px solid #e5e7eb'}}>
                    <td><strong>= Custo Base</strong></td>
                    <td className="num">—</td>
                    <td className="num"><strong>R$ {resultado.custo_base.toFixed(2)}</strong></td>
                  </tr>
                </tbody>
              </table>

              <table className="result-table" style={{marginTop: 16}}>
                <thead>
                  <tr>
                    <th colSpan="3">Detalhamento do Custo Base</th>
                  </tr>
                  <tr>
                    <th>Item</th>
                    <th className="num">Unitário</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Custo do material</td>
                    <td className="num">R$ {resultado.custo_real.toFixed(2)}</td>
                    <td className="num">R$ {resultado.custo_material_total.toFixed(2)}</td>
                  </tr>
                  <tr style={{fontSize: '0.9em'}}>
                    <td style={{paddingLeft: '40px'}}>• Perdas ({resultado.perdas_calibracao_un} m)</td>
                    <td className="num">—</td>
                    <td className="num">R$ {Number(resultado.perdas_calibracao_valor || 0).toFixed(2)}</td>
                  </tr>
                  {resultado.incluir_cordao && (
                    <tr>
                      <td>Cordão ({resultado.largura_utilizada_cm || resultado.largura_cm}% de R$ {Number(resultado.custo_cordao_config || 0).toFixed(2)})</td>
                      <td className="num">R$ {Number(resultado.valor_cordao_unitario || 0).toFixed(4)}</td>
                      <td className="num">R$ {Number(resultado.valor_cordao_total || 0).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {(resultado.servicos_detalhe && resultado.servicos_detalhe.length > 0) ? (
                <table className="result-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Serviços (NF serviço)</th>
                      <th>Imposto (%)</th>
                      <th>Valor unitário</th>
                      <th>Valor unit. c/ imposto</th>
                      <th>Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.servicos_detalhe.map((svc, idx) => {
                      const unit = Number(svc.valor_unitario_com_imposto ?? svc.valor_unitario ?? 0);
                      const total = unit * Number(resultado.quantidade || 0);
                      return (
                        <tr key={`svc-${idx}`}>
                          <td>{svc.nome || 'Serviço'}</td>
                          <td>{Number(svc.imposto_percentual || 0).toFixed(2)}%</td>
                          <td>R$ {Number(svc.valor_unitario || 0).toFixed(2)}</td>
                          <td>R$ {unit.toFixed(2)}</td>
                          <td>R$ {total.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={4} style={{textAlign:'right', fontWeight:600}}>Total serviços</td>
                      <td style={{fontWeight:600}}>R$ {Number(resultado.valor_servicos_total || 0).toFixed(2)}</td>
                    </tr>
                    {Number(resultado.valor_silk_total || 0) > 0 && (
                      <tr>
                        <td>Silk (legado)</td>
                        <td>—</td>
                        <td>R$ {Number(resultado.valor_silk_unitario || 0).toFixed(2)}</td>
                        <td>R$ {Number(resultado.valor_silk_unitario || 0).toFixed(2)}</td>
                        <td>R$ {Number(resultado.valor_silk_total || 0).toFixed(2)}</td>
                      </tr>
                    )}
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

      {/* Modal de senha */}
      {showPasswordModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Protegido por senha">
          <div className="modal">
            <h3>Área protegida</h3>
            <p>Informe a senha para ver as etapas detalhadas.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Senha"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmPassword();
                }
              }}
              autoFocus
            />
            {passwordError && <span className="modal-error">{passwordError}</span>}
            <div className="modal-actions">
              <button className="ghost" onClick={handleClosePasswordModal}>Cancelar</button>
              <button className="primary" onClick={handleConfirmPassword}>Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
