from app.supabase_client import get_client


def init_icms_estado():
    # Assumimos que a tabela já existe na Supabase
    return True


def populate_icms_estados():
    dados = [
        ("AC", 19.0), ("AL", 19.0), ("AM", 20.0), ("AP", 18.0), ("BA", 20.5),
        ("CE", 20.0), ("DF", 20.0), ("ES", 17.0), ("GO", 19.0), ("MA", 23.0),
        ("MT", 17.0), ("MS", 17.0), ("MG", 18.0), ("PA", 19.0), ("PB", 20.0),
        ("PR", 19.5), ("PE", 20.5), ("PI", 22.5), ("RJ", 20.0), ("RN", 20.0),
        ("RS", 17.0), ("RO", 19.5), ("RR", 20.0), ("SC", 17.0), ("SP", 18.0),
        ("SE", 19.0), ("TO", 20.0)
    ]

    from datetime import date

    hoje = date.today().isoformat()
    client = get_client()
    try:
        client.table('icms_estados').upsert(
            [
                {'estado': estado, 'aliquota': aliquota, 'atualizado_em': hoje}
                for estado, aliquota in dados
            ],
            on_conflict='estado'
        ).execute()
    except Exception:
        try:
            existentes = client.table('icms_estados').select('estado').execute().data or []
            estados_existentes = {row.get('estado') for row in existentes}
            novos = [
                {'estado': estado, 'aliquota': aliquota, 'atualizado_em': hoje}
                for estado, aliquota in dados
                if estado not in estados_existentes
            ]
            if novos:
                client.table('icms_estados').insert(novos).execute()
        except Exception:
            pass
