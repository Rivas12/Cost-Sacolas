from flask import Flask
from flask_cors import CORS
from app.models.gramatura import init_db
from app.models.imposto_fixo import init_imposto_fixo
from app.models.icms_estado import init_icms_estado
from app.models.configuracoes import init_configuracoes
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
    init_icms_estado()
    init_configuracoes()

    # Importar e registrar blueprints aqui
    from .routes.main_routes import main_bp
    from .routes.api_routes import api_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')

    # Habilita CORS para toda a API (origens via env CORS_ORIGINS, separadas por vírgula)
    origins_env = os.environ.get('CORS_ORIGINS', '*')
    if origins_env.strip() == '*':
        CORS(app, resources={r"/api/*": {"origins": "*"}})
    else:
        origins = [o.strip() for o in origins_env.split(',') if o.strip()]
        CORS(app, resources={r"/api/*": {"origins": origins or '*'}})

    return app
