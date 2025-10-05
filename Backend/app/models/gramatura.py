import sqlite3
import os

DB_PATH = os.environ.get('DB_PATH', 'app/database.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gramaturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gramatura TEXT NOT NULL,
            preco REAL NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

class Gramatura:
    def __init__(self, gramatura, preco, id=None):
        self.id = id
        self.gramatura = gramatura
        self.preco = preco

    @staticmethod
    def add(gramatura, preco):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO gramaturas (gramatura, preco) VALUES (?, ?)', (gramatura, preco))
        conn.commit()
        conn.close()

    @staticmethod
    def get_all():
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, gramatura, preco FROM gramaturas')
        rows = cursor.fetchall()
        conn.close()
        return [Gramatura(id=row[0], gramatura=row[1], preco=row[2]) for row in rows]
