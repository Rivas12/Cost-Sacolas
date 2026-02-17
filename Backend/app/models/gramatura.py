from app.supabase_client import get_client

def init_db():
    # Assumimos que a tabela já existe na Supabase
    return True

class Gramatura:
    def __init__(self, gramatura, preco, altura_cm=None, id=None):
        self.id = id
        self.gramatura = gramatura
        self.preco = preco
        self.altura_cm = altura_cm

    @staticmethod
    def add(gramatura, preco, altura_cm=None):
        client = get_client()
        resp = client.table('gramaturas').insert({
            'gramatura': gramatura,
            'preco': preco,
            'altura_cm': altura_cm,
        }).execute()
        return resp.data[0]['id'] if resp.data else None

    @staticmethod
    def get_all():
        client = get_client()
        resp = client.table('gramaturas').select('id, gramatura, preco, altura_cm').order('id').execute()
        rows = resp.data or []
        return [
            Gramatura(
                id=row.get('id'),
                gramatura=row.get('gramatura'),
                preco=float(row.get('preco') or 0.0),
                altura_cm=float(row.get('altura_cm')) if row.get('altura_cm') is not None else None,
            )
            for row in rows
        ]
