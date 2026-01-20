from app.supabase_client import get_client


def init_imposto_fixo():
    # Assumimos que a tabela já existe na Supabase
    return True


def populate_impostos_fixos():
    impostos = [
        ("IRPJ", 4.8),
        ("CSLL", 2.88),
        ("PIS", 0.65),
        ("COFINS", 3.0),
        ("ISS", 2.0),
        ("INSS Patronal", 20.0),
        ("FGTS", 8.0),
        ("Simples Nacional", 0.0)  # caso não se aplique, manter 0
    ]
    client = get_client()

    try:
        # Tenta upsert quando há constraint única
        client.table('impostos').upsert(
            [{'nome': nome, 'valor': valor} for nome, valor in impostos],
            on_conflict='nome'
        ).execute()
    except Exception:
        # Fallback: insere somente os que não existem para evitar erro de ON CONFLICT
        try:
            existentes = client.table('impostos').select('nome').execute().data or []
            nomes_existentes = {row.get('nome') for row in existentes}
            novos = [
                {'nome': nome, 'valor': valor}
                for nome, valor in impostos
                if nome not in nomes_existentes
            ]
            if novos:
                client.table('impostos').insert(novos).execute()
        except Exception:
            # em último caso, ignore para não quebrar boot
            pass
