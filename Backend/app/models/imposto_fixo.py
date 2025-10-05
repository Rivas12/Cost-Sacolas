import sqlite3
import os

DB_PATH = os.environ.get('DB_PATH', 'app/database.db')

def init_imposto_fixo():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS impostos_fixos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            valor REAL NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def populate_impostos_fixos():
    impostos = [
        ("IRPJ", 4.8),
        ("CSLL", 2.88),
        ("PIS", 0.65),
        ("COFINS", 3.0),
        ("ISS", 2.0),
        ("INSS Patronal", 20.0),
        ("FGTS", 8.0),
        ("Simples Nacional", 0.0) # caso não se aplique, manter 0
    ]
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for nome, valor in impostos:
        cursor.execute('''
            INSERT OR IGNORE INTO impostos_fixos (nome, valor)
            VALUES (?, ?)
        ''', (nome, valor))
    conn.commit()
    conn.close()

init_imposto_fixo()
