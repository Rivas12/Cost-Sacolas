import React, { useEffect, useState } from 'react';
import './CalculoEmLote.css';

type BatchEntry = {
  id: string;
  nome?: string;
  gramatura?: string;
  largura_cm: string;
  altura_cm: string;
  quantidade: string;
  lateral_cm?: string;
  fundo_cm?: string;
  incluir_alca?: boolean;
  estado?: string;
};

const STORAGE_KEY = 'batch_sizes_v1';

export default function CalculoEmLote(): React.ReactElement {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [form, setForm] = useState<Partial<BatchEntry>>({
    nome: '',
    gramatura: '',
    largura_cm: '',
    altura_cm: '',
    quantidade: '1',
    lateral_cm: '',
    fundo_cm: '',
    incluir_alca: false,
    estado: 'SP',
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      // ignore
    }
  }, [entries]);

  const addEntry = (e?: React.FormEvent) => {
    e?.preventDefault();
    // basic validation
    if (!form.largura_cm || !form.altura_cm) {
      window.alert('Preencha pelo menos largura e altura.');
      return;
    }
    const ent: BatchEntry = {
      id: String(Date.now()),
      nome: form.nome || '',
      gramatura: form.gramatura || '',
      largura_cm: String(form.largura_cm || ''),
      altura_cm: String(form.altura_cm || ''),
      quantidade: String(form.quantidade || '1'),
      lateral_cm: String(form.lateral_cm || ''),
      fundo_cm: String(form.fundo_cm || ''),
      incluir_alca: Boolean(form.incluir_alca),
      estado: form.estado || 'SP',
    };
    setEntries((s) => [ent, ...s]);
    // reset small fields
    setForm((f) => ({ ...f, nome: '', largura_cm: '', altura_cm: '', quantidade: '1', lateral_cm: '', fundo_cm: '' }));
  };

  const removeEntry = (id: string) => {
    if (!window.confirm('Remover este item?')) return;
    setEntries((s) => s.filter((it) => it.id !== id));
  };

  const clearAll = () => {
    if (!window.confirm('Remover todos os tamanhos salvos?')) return;
    setEntries([]);
  };

  const exportJson = async () => {
    try {
      const txt = JSON.stringify(entries, null, 2);
      await navigator.clipboard.writeText(txt);
      window.alert('JSON copiado para a área de transferência.');
    } catch (e) {
      window.alert('Falha ao copiar JSON.');
    }
  };

  return (
    <section className="calculo-lote">
      <h2 className="calculo-lote__title">Cálculo em Lote — Salvar tamanhos</h2>

      <form className="calculo-lote__form" onSubmit={addEntry}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <input placeholder="Nome (opcional)" value={form.nome} onChange={(e) => setForm(f => ({...f, nome: e.target.value}))} />
          <input placeholder="Gramatura (id ou nome)" value={form.gramatura} onChange={(e) => setForm(f => ({...f, gramatura: e.target.value}))} />
          <input placeholder="Largura (cm)" value={form.largura_cm} onChange={(e) => setForm(f => ({...f, largura_cm: e.target.value}))} />
          <input placeholder="Altura (cm)" value={form.altura_cm} onChange={(e) => setForm(f => ({...f, altura_cm: e.target.value}))} />
          <input placeholder="Qtd" value={form.quantidade} onChange={(e) => setForm(f => ({...f, quantidade: e.target.value}))} />
          <input placeholder="Lateral (cm)" value={form.lateral_cm} onChange={(e) => setForm(f => ({...f, lateral_cm: e.target.value}))} />
          <input placeholder="Fundo (cm)" value={form.fundo_cm} onChange={(e) => setForm(f => ({...f, fundo_cm: e.target.value}))} />
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={!!form.incluir_alca} onChange={(e) => setForm(f => ({...f, incluir_alca: e.target.checked}))} /> Incluir alça
          </label>
        </div>

        <div className="calculo-lote__actions" style={{marginTop:8}}>
          <button type="submit" className="calculo-lote__btn">Salvar tamanho</button>
          <button type="button" className="calculo-lote__btn" onClick={exportJson} style={{marginLeft:8}}>Exportar (copiar JSON)</button>
          <button type="button" className="calculo-lote__btn" onClick={clearAll} style={{marginLeft:8}}>Limpar tudo</button>
        </div>
      </form>

      <div style={{marginTop:16}}>
        <h3>Itens salvos ({entries.length})</h3>
        {entries.length === 0 ? (
          <div className="calculo-lote__note">Nenhum tamanho salvo ainda. Use o formulário acima para adicionar.</div>
        ) : (
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Gramatura</th>
                <th>Larg x Alt (cm)</th>
                <th>Qtd</th>
                <th>Extras</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((it) => (
                <tr key={it.id} style={{borderTop:'1px solid #eee'}}>
                  <td>{it.nome || '—'}</td>
                  <td>{it.gramatura || '—'}</td>
                  <td>{it.largura_cm} × {it.altura_cm}</td>
                  <td>{it.quantidade}</td>
                  <td>
                    {it.incluir_alca ? 'Alça' : ''}
                    {it.lateral_cm ? ` • Lateral ${it.lateral_cm}cm` : ''}
                    {it.fundo_cm ? ` • Fundo ${it.fundo_cm}cm` : ''}
                    {it.estado ? ` • ${it.estado}` : ''}
                  </td>
                  <td style={{textAlign:'right'}}>
                    <button className="calculo-lote__btn" onClick={() => removeEntry(it.id)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
