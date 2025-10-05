# Cost Sacolas — Calculadora de Custos

Sistema web para cálculos de preço final de sacolas no seu trabalho, considerando gramatura, largura, impostos (fixos e ICMS por estado), comissão, outros custos, perdas de calibração e opcionalmente o valor de silk por unidade.

## Recursos
- Cadastro/listagem de gramaturas (SQLite)
- Cadastro/listagem de impostos fixos
- Tabela de ICMS por estado
- Configurações globais: margem, outros custos, perdas de calibração, valor de silk, tema, notificações
- Calculadora de preço com decomposição de etapas (margem, comissão, impostos, ICMS, perdas, etc.)
- Envio de cotação para aprovação via Telegram (opcional)
- Frontend React + Vite com proxy para o backend Flask

## Arquitetura
- Backend: Flask (Python) + SQLite (arquivo `app/database.db`)
- Frontend: React (Vite)
- Comunicação via REST (`/api/...`)

Estrutura resumida:

```
Backend/
  app.py                # script legado para testes pontuais
  app/
    __init__.py         # app factory + CORS
    main.py             # ponto de entrada (python -m app.main)
    config/config.py    # Config (SECRET_KEY, HOST/PORT/DEBUG)
    models/             # gramatura, impostos fixos, icms, configuracoes
    routes/             # rotas principais e API
Frontend/
  src/                  # componentes React
  vite.config.ts        # proxy /api -> backend
```

## Pré-requisitos
- Windows com PowerShell
- Python 3.10+ (recomendado)
- Node.js 18+ (para o frontend)

## Configuração de ambiente (.env)
O projeto já vem com arquivos `.env.example` no Backend e no Frontend. Copie e ajuste conforme necessário.

Backend (`Backend/.env`):
- `SECRET_KEY`: chave da app Flask
- `DB_PATH`: caminho do banco SQLite (padrão: `app/database.db`)
- `FLASK_HOST`, `FLASK_PORT`, `FLASK_DEBUG`: execução do servidor
- `CORS_ORIGINS`: origens permitidas no CORS (ex.: `http://localhost:5173`)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`: para envio de aprovação (opcional)
- `TELEGRAM_SKIP_TLS_VERIFY`: 1 para desabilitar verificação TLS (apenas debug)

Frontend (`Frontend/.env`):
- `VITE_API_URL`: URL da API (ex.: `http://localhost:5000/api`)
- `VITE_APPROVAL_PASSWORD`: senha para desbloquear a visualização detalhada das etapas no UI

Observação: variáveis do Frontend com prefixo `VITE_` ficam públicas no bundle. Não coloque segredos reais nelas.

## Como rodar (Windows PowerShell)

### 1) Backend (Flask)
```powershell
# dentro da pasta do projeto
cd Backend

# (opcional) criar e ativar venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# instalar dependências mínimas
pip install flask flask-cors python-dotenv certifi

# configurar .env (edite conforme necessário)
# abra Backend/.env e ajuste as variáveis

# rodar o servidor
python -m app.main
```
O backend iniciará (por padrão) em `http://0.0.0.0:5000` com as rotas da API sob `/api`.

### 2) Frontend (Vite + React)
```powershell
# em um segundo terminal
cd Frontend
npm install

# configurar .env se necessário (Front)
# abra Frontend/.env e ajuste VITE_API_URL e VITE_APPROVAL_PASSWORD

npm run dev
```
O frontend subirá (por padrão) em `http://localhost:5173`. O proxy do Vite encaminha chamadas `/api` para o backend.

## Principais variáveis de ambiente
Backend (`Backend/.env`):
- `SECRET_KEY=...`
- `DB_PATH=app/database.db`
- `FLASK_HOST=0.0.0.0`
- `FLASK_PORT=5000`
- `FLASK_DEBUG=true`
- `CORS_ORIGINS=*` (ou lista separada por vírgula)
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_CHAT_ID=`

Frontend (`Frontend/.env`):
- `VITE_API_URL=http://localhost:5000/api`
- `VITE_APPROVAL_PASSWORD=admin`

## Rotas principais da API (Backend)
Prefixo: `/api`
- `GET /gramaturas` — lista gramaturas
- `POST /gramaturas` — cria gramatura
- `PUT /gramaturas/:id` — atualiza gramatura
- `DELETE /gramaturas/:id` — remove gramatura
- `GET /impostos_fixos` — lista impostos fixos
- `POST /impostos_fixos` — cria imposto fixo
- `PUT /impostos_fixos/:id` — atualiza imposto fixo
- `DELETE /impostos_fixos/:id` — remove imposto fixo
- `GET /icms_estados` — lista ICMS por estado
- `GET /configuracoes` — lê configurações globais
- `PUT /configuracoes` — atualiza configurações globais
- `POST /calcular_preco` — calcula o preço final e retorna detalhamento
- `POST /aprovacao/enviar` — envia cotação para aprovação (Telegram)

## Como o cálculo funciona (resumo)
Dado:
- gramatura e largura → custo de material por unidade
- perdas de calibração (unidades extras)
- silk por unidade (opcional)
- percentuais: margem, comissão, outros, impostos fixos, ICMS (por UF)

O custo total (inclui perdas e silk) é somado e os percentuais incidem sobre o preço final. A equação resultante é:

- Seja `P` o preço final e `C` o custo total; `T` a soma dos percentuais em decimal (margem + comissão + outros + impostos fixos + ICMS);
- Então: `P = C / (1 - T)`.

O backend retorna a decomposição de valores e percentuais para conferência.

## Dicas e avisos
- Não compartilhe `.env` em repositórios públicos. O projeto já inclui `.gitignore` apropriado.
- Em produção, configure `SECRET_KEY` forte e restrinja `CORS_ORIGINS`.
- `VITE_` no frontend é público; para segredos use apenas o backend.
- Telegram: preencha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` para usar a rota de aprovação.

## Próximos passos (sugestões)
- Adicionar testes unitários no backend para o cálculo e endpoints
- Criar um `requirements.txt` para o backend
- Proteção por autenticação para rotas de alteração (CRUD)
- Deploy com Docker (opcional) e pipeline CI

---
Qualquer dúvida ou ajuste que quiser fazer para o seu fluxo de trabalho, me diga que eu atualizo o projeto e a documentação.