import React, { useEffect, useState } from 'react';
import './CalculoEmLote.css';
import './Settings.css';

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
      const res = await fetch('/api/sacolas_lote');
      if (!res.ok) throw new Error('Erro ao buscar lista');
      const data = await res.json();
      setEntries((data || []).map(mapFromApi));
      setStatus('Dados carregados do Supabase.');
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
    if (!novo.nome || !novo.largura_cm || !novo.altura_cm) {
      window.alert('Preencha Nome, Largura e Altura. Os demais campos são opcionais.');
      return;
    }
    const largura = parseFloat(novo.largura_cm);
    const altura = parseFloat(novo.altura_cm);
    if (Number.isNaN(largura) || Number.isNaN(altura)) {
      window.alert('Largura e Altura devem ser números válidos.');
      return;
    }
    setError('');
    setStatus('');
    setSavingId(-1);
    try {
      const lateralVal = novo.lateral_cm ? parseFloat(novo.lateral_cm) : null;
      const fundoVal = novo.fundo_cm ? parseFloat(novo.fundo_cm) : null;
      const payload = {
        nome: (novo.nome || '').trim(),
        largura_cm: largura,
        altura_cm: altura,
        lateral_cm: Number.isNaN(lateralVal as number) ? null : lateralVal,
        fundo_cm: Number.isNaN(fundoVal as number) ? null : fundoVal,
        tem_alca: Boolean(novo.incluir_alca),
      };
      const res = await fetch('/api/sacolas_lote', {
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

  const persistEntry = async (id: number) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    if (!entry.nome || !entry.largura_cm || !entry.altura_cm) {
      window.alert('Preencha Nome, Largura e Altura.');
      return;
    }
    const largura = parseFloat(entry.largura_cm);
    const altura = parseFloat(entry.altura_cm);
    if (Number.isNaN(largura) || Number.isNaN(altura)) {
      window.alert('Largura e Altura devem ser números válidos.');
      return;
    }
    setSavingId(id);
    setError('');
    setStatus('');
    try {
      const lateralVal = entry.lateral_cm ? parseFloat(entry.lateral_cm) : null;
      const fundoVal = entry.fundo_cm ? parseFloat(entry.fundo_cm) : null;
      const payload = {
        nome: (entry.nome || '').trim(),
        largura_cm: largura,
        altura_cm: altura,
        lateral_cm: Number.isNaN(lateralVal as number) ? null : lateralVal,
        fundo_cm: Number.isNaN(fundoVal as number) ? null : fundoVal,
        tem_alca: Boolean(entry.incluir_alca),
      };
      const res = await fetch(`/api/sacolas_lote/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Erro ao atualizar');
      }
      const updated = await res.json();
      setEntries((list) => list.map((it) => (it.id === id ? { ...mapFromApi(updated), dirty: false } : it)));
      setStatus('Alterações salvas no Supabase.');
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar alterações.');
    } finally {
      setSavingId(null);
    }
  };

  const removeEntry = async (id: number) => {
    if (!window.confirm('Remover este item?')) return;
    setSavingId(id);
    setError('');
    setStatus('');
    try {
      const res = await fetch(`/api/sacolas_lote/${id}`, { method: 'DELETE' });
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
              <th style={{ textAlign: 'left' }}>Nome</th>
              <th style={{ textAlign: 'left' }}>Largura (cm)</th>
              <th style={{ textAlign: 'left' }}>Altura (cm)</th>
              <th style={{ textAlign: 'left' }}>Lateral (cm)</th>
              <th style={{ textAlign: 'left' }}>Fundo (cm)</th>
              <th style={{ textAlign: 'center' }}>Alça?</th>
              <th style={{ width: 140, textAlign: 'right' }}>Ações</th>
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
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Altura"
                    value={it.altura_cm}
                    onChange={(e) => updateEntry(it.id, 'altura_cm', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Lateral"
                    value={it.lateral_cm ?? ''}
                    onChange={(e) => updateEntry(it.id, 'lateral_cm', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Fundo"
                    value={it.fundo_cm ?? ''}
                    onChange={(e) => updateEntry(it.id, 'fundo_cm', e.target.value)}
                  />
                </td>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    checked={!!it.incluir_alca}
                    onChange={(e) => updateEntry(it.id, 'incluir_alca', e.target.checked)}
                  />
                </td>
                <td>
                  <div className="table-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      className="btn-ghost small"
                      type="button"
                      onClick={() => persistEntry(it.id)}
                      disabled={savingId === it.id || loading || !it.dirty}
                    >
                      {savingId === it.id ? 'Salvando...' : (it.dirty ? 'Salvar' : 'Salvo')}
                    </button>
                    <button
                      className="btn-icon danger"
                      onClick={() => removeEntry(it.id)}
                      type="button"
                      aria-label={`Excluir ${it.nome || 'tamanho'}`}
                      title="Excluir"
                      disabled={savingId === it.id || loading}
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
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Lateral"
                  value={novo.lateral_cm}
                  onChange={(e) => setNovo((n) => ({ ...n, lateral_cm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Fundo (opcional)"
                  value={novo.fundo_cm}
                  onChange={(e) => setNovo((n) => ({ ...n, fundo_cm: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
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
              <td>
                <button className="btn-primary small" type="button" onClick={addEntry} disabled={savingId !== null || loading}>
                  {savingId === -1 ? 'Salvando...' : 'Adicionar'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="settings-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <div>
            {loading && <span>Carregando…</span>}
            {status && <span className="save-ok">{status}</span>}
            {error && <span className="calc-error" style={{ display: 'inline-block', marginLeft: 8 }}>{error}</span>}
          </div>
          <div className="table-actions" style={{ gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={loadFromSupabase} disabled={loading}>
              Recarregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
