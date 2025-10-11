import sqlite3
import os

DB_PATH = os.environ.get('DB_PATH', 'app/database.db')

def init_configuracoes():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS configuracoes (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            margem REAL NOT NULL DEFAULT 0,
            outros_custos REAL NOT NULL DEFAULT 0,
            tema TEXT DEFAULT 'Escuro',
            notificacoes INTEGER DEFAULT 0,
            perdas_calibracao_un INTEGER NOT NULL DEFAULT 0,
            valor_silk REAL NOT NULL DEFAULT 0,
            tamanho_alca REAL NOT NULL DEFAULT 0
        )
    ''')
    
    # Garante uma única linha (id=1)
    cursor.execute('SELECT COUNT(*) FROM configuracoes')
    count = cursor.fetchone()[0]
    if count == 0:
        cursor.execute('INSERT INTO configuracoes (id, margem, outros_custos, tema, notificacoes, perdas_calibracao_un, valor_silk, tamanho_alca) VALUES (1, 0, 0, "Escuro", 0, 0, 0, 0)')
    conn.commit()
    conn.close()

def get_configuracoes():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Detecta se a coluna tamanho_alca existe (compatibilidade com DBs antigos)
    cursor.execute("PRAGMA table_info(configuracoes)")
    cols = [r[1] for r in cursor.fetchall()]
    if 'tamanho_alca' in cols:
        cursor.execute('SELECT margem, outros_custos, tema, notificacoes, perdas_calibracao_un, valor_silk, tamanho_alca FROM configuracoes WHERE id=1')
    else:
        cursor.execute('SELECT margem, outros_custos, tema, notificacoes, perdas_calibracao_un, valor_silk FROM configuracoes WHERE id=1')
    row = cursor.fetchone()
    conn.close()
    if not row:
        return {'margem': 0.0, 'outros_custos': 0.0, 'tema': 'Escuro', 'notificacoes': 0, 'perdas_calibracao_un': 0, 'valor_silk': 0.0, 'tamanho_alca': 0.0}
    # Mapear campos dependendo da presença de tamanho_alca
    if 'tamanho_alca' in cols:
        return {
            'margem': float(row[0] or 0),
            'outros_custos': float(row[1] or 0),
            'tema': row[2] or 'Escuro',
            'notificacoes': int(row[3] or 0),
            'perdas_calibracao_un': int(row[4] or 0),
            'valor_silk': float(row[5] or 0.0),
            'tamanho_alca': float(row[6] or 0.0),
        }
    else:
        return {
            'margem': float(row[0] or 0),
            'outros_custos': float(row[1] or 0),
            'tema': row[2] or 'Escuro',
            'notificacoes': int(row[3] or 0),
            'perdas_calibracao_un': int(row[4] or 0),
            'valor_silk': float(row[5] or 0.0),
            'tamanho_alca': 0.0,
        }

def update_configuracoes(margem=None, outros_custos=None, tema=None, notificacoes=None, perdas_calibracao_un=None, valor_silk=None, tamanho_alca=None):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Monta set dinâmico
    fields = []
    values = []
    if margem is not None:
        fields.append('margem=?')
        values.append(float(margem))
    if outros_custos is not None:
        fields.append('outros_custos=?')
        values.append(float(outros_custos))
    if tema is not None:
        fields.append('tema=?')
        values.append(str(tema))
    if notificacoes is not None:
        fields.append('notificacoes=?')
        values.append(int(bool(notificacoes)))
    if perdas_calibracao_un is not None:
        try:
            fields.append('perdas_calibracao_un=?')
            values.append(int(perdas_calibracao_un))
        except Exception:
            fields.append('perdas_calibracao_un=?')
            values.append(0)
    if valor_silk is not None:
        try:
            fields.append('valor_silk=?')
            values.append(float(valor_silk))
        except Exception:
            fields.append('valor_silk=?')
            values.append(0.0)
    # Suporte para tamanho_alca (salva em cm)
    if tamanho_alca is not None:
        try:
            fields.append('tamanho_alca=?')
            values.append(float(tamanho_alca))
        except Exception:
            fields.append('tamanho_alca=?')
            values.append(0.0)
    if not fields:
        conn.close()
        return False
    values.append(1)
    cursor.execute(f'UPDATE configuracoes SET {", ".join(fields)} WHERE id=?', values)
    conn.commit()
    conn.close()
    return True
