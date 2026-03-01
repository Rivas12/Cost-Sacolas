import React, { useEffect, useState } from 'react';
import './CalculoEmLote.css';
import './Settings.css';
import { apiFetch, apiJson } from '../utils/apiClient';

type BatchEntry = {
  id: number;
  nome: string;
  largura_cm: string;
  altura_cm: string;
  lateral_cm?: string;
  fundo_cm?: string;
  incluir_alca?: boolean;
  dirty?: boolean;
};

const emptyRow: Omit<BatchEntry, 'id'> = {
  nome: '',
  largura_cm: '',
  altura_cm: '',
  lateral_cm: '',
  fundo_cm: '',
  incluir_alca: false,
  dirty: false,
};

const mapFromApi = (row: any): BatchEntry => ({
  id: Number(row?.id ?? Date.now()),
  nome: row?.nome ?? '',
  largura_cm: row?.largura_cm != null ? String(row.largura_cm) : '',
  altura_cm: row?.altura_cm != null ? String(row.altura_cm) : '',
  lateral_cm: row?.lateral_cm != null ? String(row.lateral_cm) : '',
  fundo_cm: row?.fundo_cm != null ? String(row.fundo_cm) : '',
  incluir_alca: Boolean(row?.tem_alca ?? row?.incluir_alca ?? row?.alca ?? row?.temAlca),
  dirty: false,
});

export default function CalculoEmLote(): React.ReactElement {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [novo, setNovo] = useState<Omit<BatchEntry, 'id'>>(emptyRow);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadFromSupabase = async () => {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const data = await apiJson('/sacolas_lote');
      setEntries((data || []).map(mapFromApi));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar os itens.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromSupabase();
  }, []);

  const updateEntry = (id: number, field: keyof BatchEntry, value: any) => {
    setEntries((list) => list.map((it) => (it.id === id ? { ...it, [field]: value, dirty: true } : it)));
    setStatus('');
  };

  const addEntry = async () => {
    if (!novo.nome) {
      window.alert('Preencha o Nome.');
      return;
    }
    setError('');
    setStatus('');
    setSavingId(-1);
    try {
      const largura = parseNumericValue(novo.largura_cm, 0);
      const altura = parseNumericValue(novo.altura_cm, 0);
      const lateralVal = parseNumericValue(novo.lateral_cm, 0);
      const fundoVal = parseNumericValue(novo.fundo_cm, 0);
      const payload = {
        nome: (novo.nome || '').trim(),
        largura_cm: largura,
        altura_cm: altura,
        lateral_cm: lateralVal,
        fundo_cm: fundoVal,
        tem_alca: Boolean(novo.incluir_alca),
      };
      const res = await apiFetch('/sacolas_lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Erro ao salvar');
      }
      const created = await res.json();
      setEntries((list) => [...list, mapFromApi(created)]);
      setNovo(emptyRow);
      setStatus('Item salvo no Supabase.');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar.');
    } finally {
      setSavingId(null);
    }
  };

  const parseNumericValue = (val: string | undefined, defaultValue: number = 0): number => {
    if (!val || val.trim() === '') return defaultValue;
    const parsed = parseFloat(val);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  };

  const persistEntry = async (entry: BatchEntry): Promise<boolean> => {
    const largura = parseNumericValue(entry.largura_cm, 0);
    const altura = parseNumericValue(entry.altura_cm, 0);
    const lateralVal = parseNumericValue(entry.lateral_cm, 0);
    const fundoVal = parseNumericValue(entry.fundo_cm, 0);
    const payload = {
      nome: (entry.nome || '').trim(),
      largura_cm: largura,
      altura_cm: altura,
      lateral_cm: lateralVal,
      fundo_cm: fundoVal,
      tem_alca: Boolean(entry.incluir_alca),
    };
    const res = await apiFetch(`/sacolas_lote/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Erro ao atualizar');
    }
    const updated = await res.json();
    setEntries((list) => list.map((it) => (it.id === entry.id ? { ...mapFromApi(updated), dirty: false } : it)));
    return true;
  };

  const [savingAll, setSavingAll] = useState(false);

  const saveAllDirty = async () => {
    const dirtyEntries = entries.filter((e) => e.dirty);
    if (dirtyEntries.length === 0) {
      setStatus('Nenhuma alteração para salvar.');
      return;
    }
    setSavingAll(true);
    setError('');
    setStatus('');
    try {
      for (const entry of dirtyEntries) {
        await persistEntry(entry);
      }
      setStatus(`${dirtyEntries.length} item(s) salvo(s) com sucesso.`);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar alterações.');
    } finally {
      setSavingAll(false);
    }
  };

  const removeEntry = async (id: number) => {
    if (!window.confirm('Remover este item?')) return;
    setSavingId(id);
    setError('');
    setStatus('');
    try {
      const res = await apiFetch(`/sacolas_lote/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Erro ao remover');
      }
      setEntries((s) => s.filter((it) => it.id !== id));
      setStatus('Item removido.');
    } catch (e: any) {
      setError(e?.message || 'Falha ao remover.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="settings-wrap" aria-label="Cálculo em Lote">
      <h2 className="settings-title">Cálculo em Lote</h2>
      <p className="settings-sub">Cadastre tamanhos para reutilizar depois. Os dados são salvos no Supabase.</p>

      <div className="settings-card">
        <table className="result-table calculo-lote__table">
          <thead>
            <tr>
              <th style={{ width: '40%', textAlign: 'left' }}>Nome</th>
              <th style={{ width: '20%', textAlign: 'center' }}>Largura (cm)</th>
              <th style={{ width: '20%', textAlign: 'center' }}>Altura (cm)</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Alça?</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((it) => (
              <tr key={it.id}>
                <td>
                  <input
                    placeholder="Nome"
                    value={it.nome ?? ''}
                    onChange={(e) => updateEntry(it.id, 'nome', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Largura"
                    value={it.largura_cm}
                    onChange={(e) => updateEntry(it.id, 'largura_cm', e.target.value)}
                    style={{ textAlign: 'center' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Altura"
                    value={it.altura_cm}
                    onChange={(e) => updateEntry(it.id, 'altura_cm', e.target.value)}
                    style={{ textAlign: 'center' }}
                  />
                </td>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    checked={!!it.incluir_alca}
                    onChange={(e) => updateEntry(it.id, 'incluir_alca', e.target.checked)}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="table-actions" style={{ justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                    {it.dirty && <span style={{ color: '#f59e0b', fontSize: 12 }}>●</span>}
                    <button
                      className="btn-icon danger"
                      onClick={() => removeEntry(it.id)}
                      type="button"
                      aria-label={`Excluir ${it.nome || 'tamanho'}`}
                      title="Excluir"
                      disabled={savingId === it.id || loading || savingAll}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr className="calculo-lote__new-row">
              <td>
                <input
                  placeholder="Nome"
                  value={novo.nome}
                  onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Largura"
                  value={novo.largura_cm}
                  onChange={(e) => setNovo((n) => ({ ...n, largura_cm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                  style={{ textAlign: 'center' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Altura"
                  value={novo.altura_cm}
                  onChange={(e) => setNovo((n) => ({ ...n, altura_cm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                  style={{ textAlign: 'center' }}
                />
              </td>
              <td className="checkbox-cell">
                <input
                  type="checkbox"
                  checked={!!novo.incluir_alca}
                  onChange={(e) => setNovo((n) => ({ ...n, incluir_alca: e.target.checked }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="btn-primary small" type="button" onClick={addEntry} disabled={savingId !== null || loading || savingAll}>
                  {savingId === -1 ? 'Salvando...' : 'Adicionar'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="settings-actions" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {loading && <span>Carregando…</span>}
            {status && <span className="save-ok">{status}</span>}
            {error && <span className="calc-error" style={{ display: 'inline-block', marginLeft: 8 }}>{error}</span>}
            {entries.some((e) => e.dirty) && !savingAll && (
              <span style={{ color: '#f59e0b', fontSize: 13, marginLeft: 8 }}>
                ● {entries.filter((e) => e.dirty).length} alteração(ões) não salva(s)
              </span>
            )}
          </div>
          <div className="table-actions" style={{ gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={loadFromSupabase} disabled={loading || savingAll}>
              Recarregar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveAllDirty}
              disabled={loading || savingAll || !entries.some((e) => e.dirty)}
            >
              {savingAll ? 'Salvando...' : 'Salvar Tudo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
