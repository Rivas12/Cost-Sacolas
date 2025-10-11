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
            preco REAL NOT NULL,
            altura_cm REAL
        )
    ''')
    conn.commit()
    conn.close()

class Gramatura:
    def __init__(self, gramatura, preco, altura_cm=None, id=None):
        self.id = id
        self.gramatura = gramatura
        self.preco = preco
        self.altura_cm = altura_cm

    @staticmethod
    def add(gramatura, preco, altura_cm=None):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO gramaturas (gramatura, preco, altura_cm) VALUES (?, ?, ?)', (gramatura, preco, altura_cm))
        conn.commit()
        conn.close()

    @staticmethod
    def get_all():
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, gramatura, preco, altura_cm FROM gramaturas')
        rows = cursor.fetchall()
        conn.close()
        return [Gramatura(id=row[0], gramatura=row[1], preco=row[2], altura_cm=row[3]) for row in rows]
