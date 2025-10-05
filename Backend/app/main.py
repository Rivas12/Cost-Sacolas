from app import create_app
import os

app = create_app()

if __name__ == "__main__":
    # Expõe na rede local (0.0.0.0) para acesso por outros computadores
    host = os.environ.get("FLASK_HOST", "0.0.0.0")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes", "on")
    app.run(host=host, port=port, debug=debug, use_reloader=False)
