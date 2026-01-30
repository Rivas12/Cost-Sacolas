import { useEffect, useMemo, useState } from 'react';
import './StatusBadge.css';
import { apiFetch } from '../utils/apiClient';

type StatusPayload = {
  status?: 'ok' | 'degraded';
  api?: { ok: boolean };
  supabase?: {
    ok: boolean;
    latency_ms?: number;
    rows_sampled?: number;
    error?: string;
  };
  latency_ms?: number;
  timestamp?: string;
};

export default function StatusBadge() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [expanded, setExpanded] = useState<boolean>(false);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/status');
      const json: StatusPayload = await res.json();
      setData(json);
      if (!res.ok || json.status !== 'ok') {
        setError(json?.supabase?.error || 'API em estado degradado');
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError('Não foi possível conectar à API');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  const overallOk = useMemo(() => data?.status === 'ok', [data]);
  const supabaseOk = data?.supabase?.ok;

  const supabaseLabel = useMemo(() => {
    if (!data?.supabase) return '—';
    if (data.supabase.ok) {
      const latency = data.supabase.latency_ms;
      return latency !== undefined ? `${latency} ms` : 'Online';
    }
    return data.supabase.error || 'Erro';
  }, [data]);

  return (
    <div className={`status-badge ${overallOk ? 'ok' : 'warn'} ${expanded ? 'expanded' : 'compact'}`} aria-live="polite">
      <button
        type="button"
        className="status-pill"
        onClick={() => setExpanded((v) => !v)}
        title="Ver status da API"
      >
        <span className={`dot ${overallOk ? 'ok' : 'warn'}`} aria-hidden />
        <span className="pill-label">{overallOk ? 'API online' : 'API degradada'}</span>
        <span className="pill-meta">{data?.latency_ms ? `${data.latency_ms} ms` : ''}</span>
        <span className="chevron" aria-hidden>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="status-panel">
          <div className="status-row">
            <span className={`dot ${overallOk ? 'ok' : 'warn'}`} aria-hidden />
            <span className="label">API</span>
            <span className="value">{overallOk ? 'Online' : 'Degradado'}</span>
            {data?.latency_ms !== undefined && (
              <span className="meta">{`${data.latency_ms} ms`}</span>
            )}
          </div>

          <div className="status-row">
            <span className={`dot ${supabaseOk ? 'ok' : 'fail'}`} aria-hidden />
            <span className="label">Banco</span>
            <span className="value">{supabaseOk ? 'Conectado' : 'Indisponível'}</span>
            <span className="meta">{supabaseLabel}</span>
          </div>

          {error && <div className="status-error">{error}</div>}

          <div className="status-footer">
            <span className="timestamp">{lastUpdated ? `Atualizado às ${lastUpdated}` : 'Aguardando checagem'}</span>
            <button type="button" className="status-refresh" onClick={refresh} disabled={loading}>
              {loading ? 'Checando…' : 'Atualizar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
