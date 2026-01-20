import os

class Config:
    # Segurança
    SECRET_KEY = os.environ.get('SECRET_KEY', 'minha_chave_secreta')
    # Flask
    FLASK_HOST = os.environ.get('FLASK_HOST', '0.0.0.0')
    FLASK_PORT = int(os.environ.get('FLASK_PORT', '5000'))
    FLASK_DEBUG = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes', 'on')
    # Supabase API
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_SERVICE_ROLE = os.environ.get('SUPABASE_SERVICE_ROLE')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
