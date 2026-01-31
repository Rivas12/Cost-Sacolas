from app.supabase_client import get_client


# Ordem de exibição: do mais comum para o menos comum
# Importante: ICMS e IPI não entram aqui - ICMS para evitar duplicidade com o ICMS do produto/difal
# e IPI é tratado como um percentual especial sobre o preço final
IMPOSTOS_ORDEM = [
    "PIS",
    "COFINS",
    "ISS",
    "IRPJ",
    "CSLL",
    "INSS Patronal",
    "FGTS",
    "Simples Nacional",
]


def init_imposto_fixo():
    # Assumimos que a tabela já existe na Supabase
    return True


def ensure_impostos_fixos_defaults():
    """Garante que todos os impostos da ordem existam. Se faltar, insere com valor 0."""
    client = get_client()
    try:
        existentes = client.table('impostos').select('nome').execute().data or []
        nomes_existentes = {row.get('nome') for row in existentes}
        novos = [
            {'nome': nome, 'valor': 0.0}
            for nome in IMPOSTOS_ORDEM
            if nome not in nomes_existentes
        ]
        if novos:
            client.table('impostos').insert(novos).execute()
    except Exception:
        # Não quebra fluxo de inicialização em caso de erro de conexão
        pass


def populate_impostos_fixos():
    # Mantida apenas para compat; delega à ensure_impostos_fixos_defaults
    ensure_impostos_fixos_defaults()
