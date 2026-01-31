from app.supabase_client import get_client

# Não inicializa nem insere automaticamente para evitar gravação no Supabase.
def init_configuracoes():
    return True

def get_configuracoes(require_existing: bool = False):
    client = get_client()
    resp = client.table('configuracoes').select('*').eq('id', 1).limit(1).execute()
    rows = resp.data or []
    row = rows[0] if rows else None
    has_tamanho_alca = row is not None and 'tamanho_alca' in row

    if not row:
        if require_existing:
            raise LookupError('Configurações não encontradas no Supabase.')
        return {
            'margem': 0.0,
            'outros_custos': 0.0,
            'tema': 'Escuro',
            'notificacoes': 0,
            'perdas_calibracao_un': 0,
            'valor_silk': 0.0,
            'tamanho_alca': 0.0,
            'ipi_percentual': 0.0,
        }

    if has_tamanho_alca:
        return {
            'margem': float(row.get('margem') or 0),
            'outros_custos': float(row.get('outros_custos') or 0),
            'tema': row.get('tema') or 'Escuro',
            'notificacoes': int(bool(row.get('notificacoes'))),
            'perdas_calibracao_un': int(row.get('perdas_calibracao_un') or 0),
            'valor_silk': float(row.get('valor_silk') or 0.0),
            'tamanho_alca': float(row.get('tamanho_alca') or 0.0),
            'ipi_percentual': float(row.get('ipi_percentual') or 0.0),
        }
    else:
        return {
            'margem': float(row.get('margem') or 0),
            'outros_custos': float(row.get('outros_custos') or 0),
            'tema': row.get('tema') or 'Escuro',
            'notificacoes': int(bool(row.get('notificacoes'))),
            'perdas_calibracao_un': int(row.get('perdas_calibracao_un') or 0),
            'valor_silk': float(row.get('valor_silk') or 0.0),
            'tamanho_alca': 0.0,
            'ipi_percentual': float(row.get('ipi_percentual') or 0.0),
        }

def update_configuracoes(margem=None, outros_custos=None, tema=None, notificacoes=None, perdas_calibracao_un=None, valor_silk=None, tamanho_alca=None, ipi_percentual=None):
    updates = {}
    if margem is not None:
        updates['margem'] = float(margem)
    if outros_custos is not None:
        updates['outros_custos'] = float(outros_custos)
    if tema is not None:
        updates['tema'] = str(tema)
    if notificacoes is not None:
        # Se a coluna for smallint, garantir 0/1
        updates['notificacoes'] = 1 if bool(notificacoes) else 0
    if perdas_calibracao_un is not None:
        try:
            updates['perdas_calibracao_un'] = int(perdas_calibracao_un)
        except Exception:
            updates['perdas_calibracao_un'] = 0
    if valor_silk is not None:
        try:
            updates['valor_silk'] = float(valor_silk)
        except Exception:
            updates['valor_silk'] = 0.0
    if tamanho_alca is not None:
        try:
            updates['tamanho_alca'] = float(tamanho_alca)
        except Exception:
            updates['tamanho_alca'] = 0.0
    if ipi_percentual is not None:
        try:
            updates['ipi_percentual'] = float(ipi_percentual)
        except Exception:
            updates['ipi_percentual'] = 0.0

    if not updates:
        return False

    client = get_client()
    client.table('configuracoes').update(updates).eq('id', 1).execute()
    return True
