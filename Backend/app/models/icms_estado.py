import sqlite3
import os

DB_PATH = os.environ.get('DB_PATH', 'app/database.db')

def init_icms_estado():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS icms_estados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estado TEXT NOT NULL,
            aliquota REAL NOT NULL,
            atualizado_em TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for estado, aliquota in dados:
        cursor.execute('''
            INSERT OR IGNORE INTO icms_estados (estado, aliquota, atualizado_em)
            VALUES (?, ?, ?)
        ''', (estado, aliquota, hoje))
    conn.commit()
    conn.close()

init_icms_estado()
