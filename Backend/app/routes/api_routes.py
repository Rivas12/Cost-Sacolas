from flask import Blueprint, request, jsonify
from app.models.gramatura import Gramatura
from app.models.imposto_fixo import DB_PATH as DB_IMPOSTO
from app.models.icms_estado import DB_PATH as DB_ICMS
from app.models.configuracoes import get_configuracoes, update_configuracoes
import os
from urllib import request as urlrequest
from urllib import parse as urlparse
from flask_cors import cross_origin
import sqlite3
import json
import ssl
import html
import math
try:
    import certifi
    _CAFILE = certifi.where()
except Exception:
    _CAFILE = None

def _tls_context():
    try:
        # Se TELEGRAM_SKIP_TLS_VERIFY=1, desativa verificação (uso emergencial)
        if os.environ.get('TELEGRAM_SKIP_TLS_VERIFY') == '1':
            return ssl._create_unverified_context()
        # Usa bundle do certifi se disponível
        return ssl.create_default_context(cafile=_CAFILE) if _CAFILE else ssl.create_default_context()
    except Exception:
        return None

api_bp = Blueprint('api', __name__)
# Configurações (margem/outros/tema/notificações)
@api_bp.route('/configuracoes', methods=['GET'])
def get_configs():
    return jsonify(get_configuracoes())

@api_bp.route('/configuracoes', methods=['PUT'])
def put_configs():
    data = request.get_json() or {}
    ok = update_configuracoes(
        margem=data.get('margem'),
        outros_custos=data.get('outros_custos'),
        tema=data.get('tema'),
        notificacoes=data.get('notificacoes'),
        perdas_calibracao_un=data.get('perdas_calibracao_un'),
        valor_silk=data.get('valor_silk'),
        tamanho_alca=data.get('tamanho_alca'),
    )
    if not ok:
        return jsonify({'error': 'Nada para atualizar'}), 400
    return jsonify(get_configuracoes())


# Consultar todas gramaturas
@api_bp.route('/gramaturas', methods=['GET'])
def get_gramaturas():
    gramaturas = Gramatura.get_all()
    return jsonify([{'id': g.id, 'gramatura': g.gramatura, 'preco': g.preco, 'altura_cm': g.altura_cm} for g in gramaturas])

# Consultar todos impostos fixos
@api_bp.route('/impostos_fixos', methods=['GET'])
def get_impostos_fixos():
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    cursor.execute('SELECT id, nome, valor FROM impostos_fixos')
    impostos = [{'id': row[0], 'nome': row[1], 'valor': row[2]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(impostos)

# Criar imposto fixo
@api_bp.route('/impostos_fixos', methods=['POST'])
def create_imposto_fixo():
    data = request.get_json() or {}
    nome = data.get('nome')
    valor = data.get('valor')
    if not nome or valor is None:
        return jsonify({'error': 'Campos nome e valor são obrigatórios'}), 400
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO impostos_fixos (nome, valor) VALUES (?, ?)', (nome, float(valor)))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': new_id, 'nome': nome, 'valor': float(valor)}), 201

# Atualizar imposto fixo
@api_bp.route('/impostos_fixos/<int:id>', methods=['PUT'])
def update_imposto_fixo(id: int):
    data = request.get_json() or {}
    nome = data.get('nome')
    valor = data.get('valor')
    if nome is None and valor is None:
        return jsonify({'error': 'Informe nome e/ou valor para atualizar'}), 400
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    if nome is not None and valor is not None:
        cursor.execute('UPDATE impostos_fixos SET nome=?, valor=? WHERE id=?', (nome, float(valor), id))
    elif nome is not None:
        cursor.execute('UPDATE impostos_fixos SET nome=? WHERE id=?', (nome, id))
    else:
        cursor.execute('UPDATE impostos_fixos SET valor=? WHERE id=?', (float(valor), id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Imposto fixo atualizado'})

# Deletar imposto fixo
@api_bp.route('/impostos_fixos/<int:id>', methods=['DELETE'])
def delete_imposto_fixo(id: int):
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM impostos_fixos WHERE id=?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Imposto fixo removido'})

# Consultar ICMS por estado
@api_bp.route('/icms_estados', methods=['GET'])
def get_icms_estados():
    conn = sqlite3.connect(DB_ICMS)
    cursor = conn.cursor()
    cursor.execute('SELECT id, estado, aliquota, atualizado_em FROM icms_estados')
    estados = [{'id': row[0], 'estado': row[1], 'aliquota': row[2], 'atualizado_em': row[3]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(estados)

# Adicionar gramatura
@api_bp.route('/gramaturas', methods=['POST'])
def add_gramatura():
    data = request.get_json()
    gram = data.get('gramatura')
    preco = data.get('preco')
    altura = data.get('altura_cm')
    Gramatura.add(gram, preco, altura)
    return jsonify({'message': 'Gramatura adicionada!'}), 201

# Editar gramatura
@api_bp.route('/gramaturas/<int:id>', methods=['PUT'])
def edit_gramatura(id):
    data = request.get_json()
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    # Atualiza gramatura, preco e opcionalmente altura_cm
    if 'altura_cm' in data:
        cursor.execute('UPDATE gramaturas SET gramatura=?, preco=?, altura_cm=? WHERE id=?', (data['gramatura'], data['preco'], data.get('altura_cm'), id))
    else:
        cursor.execute('UPDATE gramaturas SET gramatura=?, preco=? WHERE id=?', (data['gramatura'], data['preco'], id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Gramatura editada!'})

# Deletar gramatura
@api_bp.route('/gramaturas/<int:id>', methods=['DELETE'])
def delete_gramatura(id):
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM gramaturas WHERE id=?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Gramatura deletada!'})

# Substitui calcular_preco_final por uma rota que busca a gramatura pelo id ou nome e retorna todas as etapas do cálculo
@api_bp.route('/calcular_preco', methods=['POST'])
def calcular_preco():
    data = request.get_json()
    gramatura_id = data.get('gramatura_id')
    gramatura_nome = data.get('gramatura_nome')
    largura_cm = float(data.get('largura_cm', 0))
    cfg = get_configuracoes()
    margem = float(data.get('margem', cfg.get('margem', 0)))
    comissao = float(data.get('comissao', 0))
    outros_custos = float(data.get('outros_custos', cfg.get('outros_custos', 0)))
    quantidade = int(data.get('quantidade', 1))
    perdas_calibracao_un = int(data.get('perdas_calibracao_un', cfg.get('perdas_calibracao_un', 0) or 0))
    # Silk: valor em R$ por unidade. Quando habilitado, deve ser aplicado EM CADA UNIDADE (sem rateios)
    valor_silk_cfg = float(cfg.get('valor_silk', 0) or 0)
    incluir_valor_silk = bool(data.get('incluir_valor_silk', False))
    incluir_lateral = bool(data.get('incluir_lateral', False))
    incluir_alca = bool(data.get('incluir_alca', False))
    incluir_fundo = bool(data.get('incluir_fundo', False))
    incluir_desconto = bool(data.get('incluir_desconto', False))
    try:
        desconto_percentual = float(data.get('desconto_percentual', 0) or 0) if incluir_desconto else 0.0
    except Exception:
        desconto_percentual = 0.0
    # Tamanho da alça (cm) — preferência: payload override, senão configuração (campo salvo: tamanho_alca)
    tamanho_alca_cfg = float(cfg.get('tamanho_alca', 0) or 0)
    try:
        tamanho_alca = float(data.get('tamanho_alca', tamanho_alca_cfg) or 0)
    except Exception:
        tamanho_alca = tamanho_alca_cfg
    lateral_cm = None
    fundo_cm = None
    try:
        if data.get('lateral_cm') is not None and str(data.get('lateral_cm')) != '':
            lateral_cm = float(data.get('lateral_cm'))
    except Exception:
        lateral_cm = None
    try:
        if data.get('fundo_cm') is not None and str(data.get('fundo_cm')) != '':
            fundo_cm = float(data.get('fundo_cm'))
    except Exception:
        fundo_cm = None
    # Valor unitário do silk (por unidade). Se não incluir, é 0.
    valor_silk_unit = float(data.get('valor_silk', valor_silk_cfg)) if incluir_valor_silk else 0.0
    estado = data.get('estado')
    cliente_tem_ie = data.get('cliente_tem_ie', False)

    # Buscar ICMS do estado
    if cliente_tem_ie and estado != 'SP':
        icms = 4.0
    else:
        conn = sqlite3.connect(DB_ICMS)
        cursor = conn.cursor()
        cursor.execute('SELECT aliquota FROM icms_estados WHERE estado=?', (estado,))
        row = cursor.fetchone()
        icms = row[0] if row else 0
        conn.close()

    # Buscar gramatura
    conn = sqlite3.connect(DB_IMPOSTO)
    cursor = conn.cursor()
    if gramatura_id:
        cursor.execute('SELECT preco, gramatura, altura_cm FROM gramaturas WHERE id=?', (gramatura_id,))
    elif gramatura_nome:
        cursor.execute('SELECT preco, gramatura, altura_cm FROM gramaturas WHERE gramatura=?', (gramatura_nome,))
    else:
        return jsonify({'error': 'Informe gramatura_id ou gramatura_nome'}), 400
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Gramatura não encontrada'}), 404
    # row: preco, gramatura, altura_cm
    custo_un, gramatura_nome, altura_cm_db = row
    # altura do produto solicitada (pode vir no payload) - em cm
    # Validação: altura_cm é obrigatória e deve ser um número positivo
    altura_produto = None
    try:
        if data.get('altura_cm') is None or str(data.get('altura_cm')) == '':
            return jsonify({'error': 'Campo altura_cm é obrigatório.'}), 400
        altura_produto = float(data.get('altura_cm'))
        if altura_produto <= 0:
            return jsonify({'error': 'Campo altura_cm deve ser maior que zero.'}), 400
    except Exception:
        return jsonify({'error': 'Campo altura_cm inválido.'}), 400

    # Buscar impostos fixos
    cursor.execute('SELECT valor, nome FROM impostos_fixos')
    impostos_fixos = cursor.fetchall()
    total_impostos_fixos = sum([imp[0] for imp in impostos_fixos])
    impostos_detalhe = [{'nome': imp[1], 'percentual': imp[0]} for imp in impostos_fixos]
    conn.close()

    # Decimais originais (antes de eventual desconto que reduz a margem)
    margem_decimal_original = margem / 100
    comissao_decimal = comissao / 100
    outros_custos_decimal = outros_custos / 100
    impostos_decimal = total_impostos_fixos / 100
    icms_decimal = icms / 100

    # Custo por unidade do material + silk (se houver)
    # Ajustes de dimensão: lateral dobra (2x) e soma à largura; fundo soma à altura (sem dobrar)
    lateral_effective = (lateral_cm or 0) * 2.0
    largura_used = float(largura_cm or 0) + lateral_effective

    # custo por unidade considera a largura efetiva usada
    custo_material_unit = custo_un * (largura_used / 100)
    custo_real = round(custo_material_unit + (valor_silk_unit or 0), 2)

    # Quantidade total considerada inclui perdas de calibração (unidades extras)
    quantidade_total = max(0, quantidade + max(0, perdas_calibracao_un))

    # Total de silk (por unidade x quantidade solicitada) — não considerar perdas
    valor_silk_total = round((valor_silk_unit or 0) * quantidade, 2)

    # Custo total (inclui silk e perdas)
    custo_total = round(custo_real * quantidade_total, 2)

    # Calcula o preço final usando a margem original (para comparar/mostrar economia)
    total_percentual_original = margem_decimal_original + comissao_decimal + outros_custos_decimal + impostos_decimal + icms_decimal
    denom_orig = max(1e-9, (1 - total_percentual_original))
    preco_final_sem_desconto = round(custo_total / denom_orig, 2)

    # Se houver desconto, ele reduz a margem percentual aplicada
    margem_aplicada = margem
    if incluir_desconto:
        try:
            margem_aplicada = max(0.0, float(margem) - float(desconto_percentual or 0))
        except Exception:
            margem_aplicada = max(0.0, float(margem))
    margem_decimal_aplicada = margem_aplicada / 100.0

    # Soma de percentuais com margem aplicada
    total_percentual = margem_decimal_aplicada + comissao_decimal + outros_custos_decimal + impostos_decimal + icms_decimal

    # Preço final resolve a equação: P = custo_total + total_percentual * P  =>  P = custo_total / (1 - total_percentual)
    denom = max(1e-9, (1 - total_percentual))
    preco_final = round(custo_total / denom, 2)

    # Decomposição: percentuais incidem sobre o preço final (já com margem aplicada)
    valor_margem = round(preco_final * margem_decimal_aplicada, 2)
    valor_comissao = round(preco_final * comissao_decimal, 2)
    valor_outros = round(preco_final * outros_custos_decimal, 2)
    valor_impostos = round(preco_final * impostos_decimal, 2)
    valor_icms = round(preco_final * icms_decimal, 2)

    # Valor economizado por causa do desconto na margem (diferença entre sem desconto e com margem aplicada)
    valor_desconto = round(preco_final_sem_desconto - preco_final, 2) if incluir_desconto else 0.0

    # Verificação: custo total + componentes percentuais deve fechar o preço final
    check = round(custo_total + valor_margem + valor_comissao + valor_outros + valor_impostos + valor_icms, 2)

    # Cálculo de aproveitamento da altura da bobina (percentual da bobina que será usado
    # ao encaixar o maior número inteiro de unidades por bobina)
    aproveitamento_percentual = None
    unidades_por_bobina = None
    aproveitamento_detalhe = None
    if altura_produto and altura_cm_db:
        try:
            if altura_cm_db > 0 and altura_produto > 0:
                # Cada sacola usa frente e verso -> dobra a altura do produto, e soma o fundo (se houver)
                # Se incluir_alca, soma o valor da alça (em cm) UMA vez (não dobra)
                altura_effective = (altura_produto * 2.0) + (fundo_cm or 0)
                if incluir_alca:
                    # use tamanho_alca (saved size) when including alça in effective height
                    altura_effective += float(tamanho_alca or 0)
                unidades_por_bobina = int(altura_cm_db // altura_effective)
                # Altura efetivamente utilizada por bobina ao cortar unidades inteiras (considerando frente+verso e fundo)
                utilizada_por_bobina = unidades_por_bobina * altura_effective
                aproveitamento_percentual = round((utilizada_por_bobina / altura_cm_db) * 100.0, 2)
                # Monta detalhe completo do aproveitamento
                aproveitamento_detalhe = {
                    'bobina_altura_cm': float(altura_cm_db),
                    'altura_produto_cm': float(altura_produto),
                    'fundo_cm_unit': float(fundo_cm or 0),
                    'altura_unit_effective_cm': float(altura_effective),
                    'unidades_por_bobina': int(unidades_por_bobina),
                    'utilizada_por_bobina_cm': float(utilizada_por_bobina),
                    'sobra_por_bobina_cm': float(max(0, altura_cm_db - utilizada_por_bobina)),
                    'bobina_largura_utilizada_cm': float(largura_used),
                    'largura_input_cm': float(largura_cm),
                    'lateral_total_cm': float(lateral_effective),
                }
        except Exception:
            aproveitamento_percentual = None
            unidades_por_bobina = None

    # Recompute effective unit height (including alça if applicable) for response fields
    altura_unit_effective_value = None
    try:
        if altura_produto is not None:
            altura_unit_effective_value = (altura_produto * 2.0) + (fundo_cm or 0)
            if incluir_alca:
                altura_unit_effective_value += float(tamanho_alca or 0)
    except Exception:
        altura_unit_effective_value = None

    # unidades_por_bobina (fallback) and totals
    unidades_por_bobina_calc = None
    utilizada_por_bobina_value = None
    sobra_por_bobina = None
    bobinas_necessarias = None
    total_altura_needed = None
    total_bobinas = None
    sobra_total = None
    try:
        if altura_unit_effective_value and altura_cm_db:
            unidades_por_bobina_calc = int(altura_cm_db // altura_unit_effective_value)
            unidades_use = unidades_por_bobina if unidades_por_bobina is not None else unidades_por_bobina_calc
            utilizada_por_bobina_value = (unidades_use or 0) * (altura_unit_effective_value or 0)
            sobra_por_bobina = max(0, altura_cm_db - (utilizada_por_bobina_value or 0))
            if unidades_use and unidades_use > 0:
                bobinas_necessarias = math.ceil(quantidade / unidades_use)
            if altura_cm_db and altura_cm_db > 0 and altura_unit_effective_value is not None:
                total_altura_needed = quantidade * altura_unit_effective_value
                total_bobinas = math.ceil(total_altura_needed / altura_cm_db) if altura_cm_db > 0 else None
                if total_bobinas is not None:
                    sobra_total = (total_bobinas * altura_cm_db) - total_altura_needed
    except Exception:
        pass

    return jsonify({
        'gramatura_nome': gramatura_nome,
        'gramatura_altura_cm': altura_cm_db,
        # custo_un ajustado: custo unitário considerando perdas (custo_total / quantidade solicitada)
        'custo_un': round((custo_total / max(1, quantidade)), 2),
        'largura_cm': largura_cm,
        # custo_real: custo por unidade incluindo silk
        'custo_real': round(custo_real, 2),
        'custo_total': custo_total,
        'margem_percentual': margem,
        'comissao_percentual': comissao,
        'outros_custos_percentual': outros_custos,
        'impostos_fixos_percentual': round(total_impostos_fixos, 2),
        'icms_percentual': round(icms, 2),
        'impostos_fixos_detalhe': impostos_detalhe,
        'quantidade': quantidade,
        'perdas_calibracao_un': perdas_calibracao_un,
        'quantidade_total': quantidade_total,
        'valor_margem': valor_margem,
        'valor_comissao': valor_comissao,
        'valor_outros': valor_outros,
        'valor_impostos_fixos': valor_impostos,
        'valor_icms': valor_icms,
        # Compatibilidade: mantém valor_silk como TOTAL do silk em R$
        'valor_silk': valor_silk_total,
        # Novos campos para clareza
        'valor_silk_unitario': round(valor_silk_unit, 2),
        'valor_silk_total': valor_silk_total,
        'incluir_valor_silk': incluir_valor_silk,
        'incluir_lateral': incluir_lateral,
        'incluir_alca': incluir_alca,
    'incluir_fundo': incluir_fundo,
    'lateral_cm': lateral_cm,
    'fundo_cm': fundo_cm,
    'largura_utilizada_cm': round(largura_used, 2),
    'altura_utilizada_cm': round(altura_unit_effective_value, 2) if altura_unit_effective_value is not None else None,
        'preco_final': preco_final,
        'incluir_desconto': incluir_desconto,
        'desconto_percentual': round(desconto_percentual, 2),
        'margem_aplicada_percentual': round(margem_aplicada, 2),
        'valor_desconto': round(valor_desconto, 2),
        'check': check,
        'altura_produto_cm': altura_produto,
        'aproveitamento_altura_percentual': aproveitamento_percentual,
        'unidades_por_bobina': unidades_por_bobina if unidades_por_bobina is not None else (unidades_por_bobina_calc or 0),
    # Expose tamanho_alca (saved value). Keep valor_alca for compatibility but it mirrors tamanho_alca.
    'tamanho_alca': float(tamanho_alca or 0),
    'valor_alca': float(tamanho_alca or 0),
        'altura_unit_effective_cm': round(altura_unit_effective_value, 2) if altura_unit_effective_value is not None else None,
        'aproveitamento_detalhe': aproveitamento_detalhe,
        'utilizada_por_bobina_cm': round(utilizada_por_bobina_value, 2) if utilizada_por_bobina_value is not None else None,
        'sobra_por_bobina_cm': round(sobra_por_bobina, 2) if sobra_por_bobina is not None else None,
        'bobinas_necessarias': bobinas_necessarias,
        'total_altura_necessaria_cm': round(total_altura_needed, 2) if total_altura_needed is not None else None,
        'total_bobinas_necessarias': total_bobinas,
        'sobra_total_cm': round(sobra_total, 2) if sobra_total is not None else None,
    })


# Enviar cotação para aprovação via Telegram
@api_bp.route('/aprovacao/enviar', methods=['POST', 'OPTIONS'])
@cross_origin(origins='*', allow_headers=['Content-Type'], methods=['POST', 'OPTIONS'])
def enviar_aprovacao():
    if request.method == 'OPTIONS':
        # Responde preflight CORS
        return ('', 204)
    data = request.get_json() or {}
    cot = data.get('cotacao') or data
    cliente = data.get('cliente') or {}

    # Lê do ambiente: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID
    token = os.environ.get('TELEGRAM_BOT_TOKEN')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID')

    if not token or not chat_id:
        return jsonify({'error': 'Configuração do Telegram ausente. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.'}), 400

    # Monta mensagem (HTML com quebras e ênfase)
    def fmt_money(v):
        try:
            n = float(v)
            # Formata com separador de milhar e 2 casas, padrão US, depois converte para pt-BR
            s = f"{n:,.2f}"  # ex.: 12,345.67
            s = s.replace(",", "X").replace(".", ",").replace("X", ".")  # -> 12.345,67
            return f"R$ {s}"
        except Exception:
            return str(v)
    def esc(v):
        return html.escape(str(v))

    custo_total_calc = (float(cot.get('custo_real') or 0) * int(cot.get('quantidade') or 1))
    custo_total = cot.get('custo_total') or custo_total_calc

    linhas = [
        '<b>📩 Nova cotação para aprovação</b>',
        '',
    ]
    if cliente.get('nome'):
        linhas.append(f"<b>Cliente:</b> {esc(cliente.get('nome'))}")
    if cot.get('gramatura_nome'):
        linhas.append(f"<b>Gramatura:</b> {esc(cot.get('gramatura_nome'))}")
    # Dimensões: largura x altura (altura é opcional e não impacta o cálculo)
    if cot.get('largura_cm') is not None:
        largura = cot.get('largura_cm')
        altura = cot.get('altura_cm')
        if altura is not None and str(altura) != '' and str(altura).lower() != 'none':
            linhas.append(f"<b>Dimensão:</b> {largura} (largura) x {altura} (altura) cm")
        else:
            linhas.append(f"<b>Largura:</b> {largura} cm")
    if cot.get('quantidade') is not None:
        linhas.append(f"<b>Quantidade:</b> {cot.get('quantidade')}")
    if cot.get('icms_percentual') is not None:
        linhas.append(f"<b>ICMS:</b> {cot.get('icms_percentual')}%")

    if cliente.get('observacoes'):
        linhas.extend(['', f"<b>Obs.:</b> {esc(cliente.get('observacoes'))}"])

    linhas.extend([
        '',
        '<b>📋 Detalhes</b>',
        # Exibe "c/ Silk" apenas quando o silk estiver incluído e com valor > 0
        # custo_real já contempla o silk quando incluído no cálculo
        f"• {'Custo Un c/ Silk' if (bool(cot.get('incluir_valor_silk')) and float(cot.get('valor_silk_unitario') or 0) > 0) else 'Custo Un'}: {fmt_money(cot.get('custo_real'))}",
        f"• Perdas calibração: {int(cot.get('perdas_calibracao_un') or 0)} un",
        f"• Quantidade total (com perdas): {int(cot.get('quantidade_total') or cot.get('quantidade') or 0)}",
        f"• Comissão: {cot.get('comissao_percentual', 0)}% → {fmt_money(cot.get('valor_comissao'))}",
        f"• Impostos fixos: {cot.get('impostos_fixos_percentual', 0)}% → {fmt_money(cot.get('valor_impostos_fixos'))}",
        f"• Outros: {cot.get('outros_custos_percentual', 0)}% → {fmt_money(cot.get('valor_outros'))}",
    ])

    # Extras (Silk) apenas quando incluído
    if bool(cot.get('incluir_valor_silk')):
        linhas.extend([
            f"• Silk por unidade: {fmt_money(cot.get('valor_silk_unitario') or 0)}",
            f"• Silk total: {fmt_money(cot.get('valor_silk_total') or cot.get('valor_silk') or 0)}",
        ])

    # Outros extras (lateral / alça)
    extras_flags = []
    if bool(cot.get('incluir_lateral')):
        extras_flags.append('Lateral')
    if bool(cot.get('incluir_alca')):
        extras_flags.append('Alça')
    if bool(cot.get('incluir_fundo')):
        extras_flags.append('Fundo')
    if extras_flags:
        linhas.extend(['', f"• Extras: {', '.join(extras_flags)}"])

    # Desconto (se houver)
    if bool(cot.get('incluir_desconto')):
        linhas.append(f"• Desconto: {cot.get('desconto_percentual', 0)}% → {fmt_money(cot.get('valor_desconto') or 0)}")

    linhas.extend([
        '',
        '<b>📊 Resumo final</b>',
        f"<b>Custo total:</b> {fmt_money(custo_total)}",
        f"<b>Preço final:</b> {fmt_money(cot.get('preco_final'))}",
    ])
    # Margem: se houver desconto, mostramos margem aplicada e detalhe
    if bool(cot.get('incluir_desconto')):
        linhas.append(f"<b>Margem (aplicada):</b> {cot.get('margem_aplicada_percentual', 0)}% (original {cot.get('margem_percentual', 0)}% • desconto {cot.get('desconto_percentual', 0)}%) • {fmt_money(cot.get('valor_margem'))}")
        linhas.append(f"<b>Desconto:</b> {cot.get('desconto_percentual', 0)}% • {fmt_money(cot.get('valor_desconto') or 0)}")
    else:
        linhas.append(f"<b>Margem:</b> {cot.get('margem_percentual', 0)}% • {fmt_money(cot.get('valor_margem'))}")

    # Aproveitamento (se disponível)
    if cot.get('aproveitamento_altura_percentual') is not None:
        linhas.extend(['', f"• Aproveitamento (altura): {cot.get('aproveitamento_altura_percentual')}% • {cot.get('unidades_por_bobina', '—')} un/bobina"]) 

    text = '\n'.join(linhas)

    # Envia para Telegram (application/x-www-form-urlencoded)
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = urlparse.urlencode({
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML',
            'disable_web_page_preview': 'true',
        }).encode('utf-8')
        req = urlrequest.Request(url, data=payload, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urlrequest.urlopen(req, timeout=15, context=_tls_context()) as resp:
            status = resp.getcode()
            body = resp.read()
        if status != 200:
            # Tenta extrair a descrição do erro do Telegram
            desc = None
            try:
                data = json.loads(body.decode('utf-8'))
                desc = data.get('description') or data
            except Exception:
                desc = body.decode('utf-8', errors='ignore')
            return jsonify({'error': f'Falha ao enviar para Telegram (status {status})', 'telegram': desc}), 502
    except Exception as e:
        return jsonify({'error': f'Falha ao enviar: {e}'}), 502

    return jsonify({'message': 'Enviado para aprovação', 'preview': text})

