import React, { useEffect, useState } from 'react';
import './Settings.css'; // Reutiliza estilos globais (cards, tabelas, botões)
import { apiFetch, apiJson } from '../utils/apiClient';

export default function Gramaturas() {
  const [itens, setItens] = useState([]);
  const [novo, setNovo] = useState({ gramatura: '', preco: '', altura_cm: '', icms_estadual: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const API = {
    LISTAR: '/gramaturas',
    CRIAR: '/gramaturas',
    ATUALIZAR: (id) => `/gramaturas/${id}`,
    DELETAR: (id) => `/gramaturas/${id}`,
  };

  const toNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    const s = String(val).replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const maybeNumberOrNull = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const s = String(val).replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  const carregar = async () => {
    setLoading(true); setError('');
    try {
      const data = await apiJson(API.LISTAR);
      const lista = Array.isArray(data) ? data : [];
      setItens(lista.map((g) => ({
        ...g,
        icms_estadual: g.icms_estadual ?? '',
        altura_cm: g.altura_cm ?? '',
      })));
    } catch (e) {
      setError(e.message || 'Erro ao buscar gramaturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const remover = async (id) => {
    setError('');
    if (!id) {
      // Item ainda não salvo (somente local)
      setItens((list) => list.filter((i) => i.id !== id));
      return;
    }
    const res = await apiFetch(API.DELETAR(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || 'Falha ao excluir');
      return;
    }
    setItens((list) => list.filter((i) => i.id !== id));
  };

  const salvarTudo = async () => {
    setError(''); setSaved(''); setSaving(true);
    try {
      // Atualiza existentes
      const updates = itens
        .filter((g) => !!g.id)
        .map(async (g) => {
          const payload = {
            gramatura: g.gramatura,
            preco: toNumber(g.preco),
            altura_cm: maybeNumberOrNull(g.altura_cm),
            icms_estadual: maybeNumberOrNull(g.icms_estadual),
          };
          const res = await apiFetch(API.ATUALIZAR(g.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Falha ao salvar ${g.gramatura}`);
          return true;
        });

      await Promise.all(updates);

      // Cria novos (sem id)
      const novos = itens.filter((g) => !g.id && g.gramatura && g.preco !== '');
      for (const g of novos) {
        const payload = {
          gramatura: g.gramatura,
          preco: toNumber(g.preco),
          altura_cm: maybeNumberOrNull(g.altura_cm),
          icms_estadual: maybeNumberOrNull(g.icms_estadual),
        };
        const res = await apiFetch(API.CRIAR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Falha ao adicionar ${g.gramatura}`);
      }

      // Também cria o que estiver na linha de novo
      if (novo.gramatura && novo.preco !== '') {
        const payload = {
          gramatura: novo.gramatura,
          preco: toNumber(novo.preco),
          altura_cm: maybeNumberOrNull(novo.altura_cm),
          icms_estadual: maybeNumberOrNull(novo.icms_estadual),
        };
        const res = await apiFetch(API.CRIAR, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Falha ao adicionar ${novo.gramatura}`);
        setNovo({ gramatura: '', preco: '', altura_cm: '', icms_estadual: '' });
      }

      await carregar();
      setSaved('Gramaturas salvas com sucesso.');
    } catch (e) {
      setError(e.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-wrap" aria-label="Gramaturas">
      <h2 className="settings-title">Gramaturas</h2>
      <p className="settings-sub">Gerencie a lista de gramaturas e seus preços base.</p>

      <div className="settings-card">
        {error && <div className="calc-error" style={{color:'#b30000', marginBottom:10}}>{error}</div>}
        {loading ? (
          <div>Carregando...</div>
        ) : (
          <table className="result-table">
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Gramatura</th>
                <th style={{textAlign:'left'}}>Preço</th>
                <th style={{textAlign:'left'}}>Altura (cm)</th>
                <th style={{textAlign:'left'}}>ICMS estadual (%)</th>
                <th style={{width:90, textAlign:'left'}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((g) => (
                <tr key={g.id || `${g.gramatura}-${Math.random()}`}>
                  <td>
                    <input
                      placeholder="Ex.: 30 micras"
                      value={g.gramatura}
                      onChange={(e) => setItens((list) => list.map((i) => (i.id === g.id ? { ...i, gramatura: e.target.value } : (i === g ? { ...i, gramatura: e.target.value } : i))))}
                    />
                  </td>
                  <td>
                    <div className="input-suffix">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={g.preco}
                        onChange={(e) => setItens((list) => list.map((i) => (i.id === g.id ? { ...i, preco: e.target.value } : (i === g ? { ...i, preco: e.target.value } : i))))}
                      />
                      <span className="suffix">R$</span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Altura (cm)"
                      value={g.altura_cm ?? ''}
                      onChange={(e) => setItens((list) => list.map((i) => (i.id === g.id ? { ...i, altura_cm: e.target.value } : (i === g ? { ...i, altura_cm: e.target.value } : i))))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex.: 4"
                      value={g.icms_estadual ?? ''}
                      onChange={(e) => setItens((list) => list.map((i) => (i.id === g.id ? { ...i, icms_estadual: e.target.value } : (i === g ? { ...i, icms_estadual: e.target.value } : i))))}
                    />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn-icon danger"
                        onClick={() => remover(g.id)}
                        type="button"
                        aria-label={`Excluir ${g.gramatura}`}
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
                  <input placeholder="Nova gramatura" value={novo.gramatura} onChange={(e)=>setNovo((n)=>({...n, gramatura:e.target.value}))} />
                </td>
                <td>
                  <div className="input-suffix">
                    <input type="number" step="0.01" placeholder="0,00" value={novo.preco} onChange={(e)=>setNovo((n)=>({...n, preco:e.target.value}))} />
                    <span className="suffix">R$</span>
                  </div>
                </td>
                <td>
                  <input type="number" step="0.1" placeholder="Altura (cm)" value={novo.altura_cm} onChange={(e)=>setNovo((n)=>({...n, altura_cm:e.target.value}))} />
                </td>
                <td>
                  <input type="number" step="0.01" placeholder="ICMS (%)" value={novo.icms_estadual} onChange={(e)=>setNovo((n)=>({...n, icms_estadual:e.target.value}))} />
                </td>
                <td>
                  <button className="btn-ghost small" type="button" onClick={()=>{ if(!novo.gramatura) return; setItens((list)=>[...list, { gramatura: novo.gramatura, preco: novo.preco, altura_cm: novo.altura_cm, icms_estadual: novo.icms_estadual }]); setNovo({ gramatura:'', preco:'', altura_cm:'', icms_estadual:'' }); }}>Adicionar</button>
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
