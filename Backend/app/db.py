"""
Legacy helper (sqlite/psycopg2) — no longer used after migrating to Supabase client.
Kept as stub to avoid accidental imports; remove when safe.
"""

def get_connection():
    raise RuntimeError("Use app.supabase_client.get_client() instead of get_connection")
