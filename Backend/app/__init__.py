from flask import Flask
from flask_cors import CORS
from app.models.gramatura import init_db
from app.models.imposto_fixo import init_imposto_fixo
from app.config.config import Config
import os

# Carrega variáveis de ambiente do arquivo .env, se disponível
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

def create_app():
    app = Flask(__name__)
    # Configurações via objeto Config (SECRET_KEY, etc.)
    app.config.from_object(Config)

    # Inicializa o banco de dados e tabelas
    init_db()
    init_imposto_fixo()
    # Não semeamos automaticamente Supabase para evitar gravações inesperadas.
    # Se precisar popular, faça manualmente via script/CLI.

    # Importar e registrar blueprints aqui
    from .routes.main_routes import main_bp
    from .routes.api_routes import api_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')

    # Habilita CORS para toda a API (origens via env CORS_ORIGINS, separadas por vírgula)
    origins_env = os.environ.get('CORS_ORIGINS', '*')
    cors_config = {
        "origins": "*" if origins_env.strip() == '*' else [o.strip() for o in origins_env.split(',') if o.strip()],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
    }
    CORS(app, resources={r"/api/*": cors_config})

    return app
