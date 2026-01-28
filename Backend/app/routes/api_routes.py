from flask import Blueprint, request, jsonify, send_file, current_app
from app.supabase_client import get_client, SupabaseConfigError
from app.models.gramatura import Gramatura
from app.models.imposto_fixo import init_imposto_fixo, ensure_impostos_fixos_defaults, IMPOSTOS_ORDEM
from app.models.configuracoes import get_configuracoes, update_configuracoes
import os
from urllib import request as urlrequest
from urllib import parse as urlparse
from flask_cors import cross_origin
import json
import ssl
import html
import math
import io
import time
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.units import mm
try:
    import certifi
    _CAFILE = certifi.where()
except Exception:
    _CAFILE = None

# Alíquotas padrão por estado (ICMS "cheio") usadas quando o cliente não possui IE
ICMS_ESTADO_PADRAO = {
    "AC": 19.0, "AL": 19.0, "AM": 20.0, "AP": 18.0, "BA": 20.5,
    "CE": 20.0, "DF": 20.0, "ES": 17.0, "GO": 19.0, "MA": 23.0,
    "MT": 17.0, "MS": 17.0, "MG": 18.0, "PA": 19.0, "PB": 20.0,
    "PR": 19.5, "PE": 20.5, "PI": 22.5, "RJ": 20.0, "RN": 20.0,
    "RS": 17.0, "RO": 19.5, "RR": 20.0, "SC": 17.0, "SP": 18.0,
    "SE": 19.0, "TO": 20.0,
}
ESTADOS_BR = sorted(ICMS_ESTADO_PADRAO.keys())

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


@api_bp.route('/status', methods=['GET'])
def status():
    """Health-check da API e conexão com Supabase."""
    started = time.perf_counter()

    payload = {
        'api': {'ok': True},
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }

    try:
        client = get_client()
    except SupabaseConfigError as e:
        payload['supabase'] = {'ok': False, 'error': str(e)}
    except Exception as e:
        payload['supabase'] = {'ok': False, 'error': f'Erro inesperado ao criar cliente: {e}'}
    else:
        ping_started = time.perf_counter()
        try:
            resp = client.table('gramaturas').select('id').limit(1).execute()
            rows = resp.data or []
            payload['supabase'] = {
                'ok': True,
                'latency_ms': round((time.perf_counter() - ping_started) * 1000, 1),
                'rows_sampled': len(rows),
            }
        except Exception as e:
            payload['supabase'] = {'ok': False, 'error': str(e)}

    payload['latency_ms'] = round((time.perf_counter() - started) * 1000, 1)
    payload['status'] = 'ok' if payload.get('supabase', {}).get('ok') else 'degraded'
    status_code = 200 if payload['status'] == 'ok' else 503
    return jsonify(payload), status_code


@api_bp.route('/canvas/pastas', methods=['GET'])
@api_bp.route('/canvas/opinioes', methods=['GET'])
def listar_pastas_canvas():
    """Lista todas as pastas disponíveis dentro do bucket do canvas."""
    bucket = os.environ.get('CANVAS_BUCKET', 'CanvasImage')
    client = get_client()

    try:
        objects = client.storage.from_(bucket).list()
    except Exception as e:
        return jsonify({'error': f'Erro ao listar bucket {bucket}: {e}'}), 500

    folder_counts = {}
    for obj in objects:
        name = obj.get('name') if isinstance(obj, dict) else getattr(obj, 'name', None)
        if not name:
            continue

        # Supabase retorna pastas como itens sem metadata; arquivos têm metadata
        is_folder_entry = False
        try:
            meta = obj.get('metadata') if isinstance(obj, dict) else getattr(obj, 'metadata', None)
            obj_id = obj.get('id') if isinstance(obj, dict) else getattr(obj, 'id', None)
            is_folder_entry = meta in (None, {}) and obj_id in (None, '')
        except Exception:
            is_folder_entry = False

        if '/' in name:
            folder = name.split('/', 1)[0].strip()
        elif is_folder_entry:
            folder = name.strip()
        else:
            continue

        if not folder:
            continue
        folder_counts[folder] = folder_counts.get(folder, 0) + 1

    folders = [
        {'name': folder, 'files': count}
        for folder, count in sorted(folder_counts.items(), key=lambda item: item[0].lower())
    ]

    return jsonify({'folders': folders})


@api_bp.route('/canvas/bases', methods=['GET'])
def listar_bases_canvas():
    """Lista imagens públicas do bucket CanvasImage dentro de uma pasta (opinião)."""
    bucket = os.environ.get('CANVAS_BUCKET', 'CanvasImage')
    folder = (request.args.get('folder') or '').strip('/')
    client = get_client()

    list_path = folder or ''
    try:
        objects = client.storage.from_(bucket).list(list_path)
    except Exception as e:
        suffix = f" na pasta {folder}" if folder else ''
        return jsonify({'error': f'Erro ao listar bucket {bucket}{suffix}: {e}'}), 500

    allowed_ext = {'.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'}
    files = []
    for obj in objects:
        name = obj.get('name') if isinstance(obj, dict) else getattr(obj, 'name', None)
        if not name:
            continue

        # Ignora subpastas; se quiser recursivo, precisaríamos iterar nelas
        try:
            meta = obj.get('metadata') if isinstance(obj, dict) else getattr(obj, 'metadata', None)
            if meta in (None, {}):
                continue
        except Exception:
            pass

        ext = os.path.splitext(name)[1].lower()
        if ext not in allowed_ext:
            continue

        full_path = f"{list_path}/{name}" if list_path else name
        try:
            public_url = client.storage.from_(bucket).get_public_url(full_path)
        except Exception:
            public_url = None
        files.append({'name': name, 'path': full_path, 'url': public_url})

    return jsonify({'folder': folder, 'files': files})


@api_bp.route('/batch/pdf', methods=['POST'])
def gerar_pdf_batch():
    data = request.get_json() or {}
    itens = data.get('itens') or []
    if not isinstance(itens, list) or len(itens) == 0:
        return jsonify({'error': 'Envie uma lista de itens para gerar o PDF.'}), 400

    # Monta documento em memória
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    story = []

    agora = datetime.now()
    titulo = f"Cálculo em Lote — {agora.strftime('%d/%m/%Y %H:%M')}"
    story.append(Paragraph(titulo, styles['Title']))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Total de itens: {len(itens)}", styles['Normal']))
    story.append(Spacer(1, 12))

    # Cabeçalho e linhas
    header = ['Nome', 'Largura (cm)', 'Altura (cm)', 'Lateral (cm)', 'Fundo (cm)', 'Alça?']
    rows = [header]
    for it in itens:
        rows.append([
            it.get('nome') or '-',
            str(it.get('largura_cm') or '-'),
            str(it.get('altura_cm') or '-'),
            str(it.get('lateral_cm') or '-'),
            str(it.get('fundo_cm') or '-'),
            'Sim' if it.get('incluir_alca') else 'Não'
        ])

    table = Table(rows, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#00bfff')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f5f6fa')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d7de')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fbff')])
    ]))

    story.append(table)
    doc.build(story)
    buffer.seek(0)

    filename = f"calculo-lote-{agora.strftime('%Y-%m-%d')}.pdf"
    return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=filename)


@api_bp.route('/batch/pdf-precos', methods=['POST'])
def gerar_pdf_batch_precos():
    payload = request.get_json() or {}
    itens = payload.get('itens') or []
    contexto = payload.get('contexto') or {}

    # Validações básicas para retornar erro claro ao front
    if not isinstance(itens, list) or len(itens) == 0:
        return jsonify({'error': 'Envie uma lista de itens para gerar o PDF.'}), 400
    if not contexto.get('gramatura_id') and not contexto.get('gramatura_nome'):
        return jsonify({'error': 'Informe gramatura_id ou gramatura_nome no contexto.'}), 400

    resultados = []
    try:
        with current_app.test_client() as client:
            for it in itens:
                base_payload = {**contexto}
                base_payload['largura_cm'] = it.get('largura_cm')
                base_payload['altura_cm'] = it.get('altura_cm')
                base_payload['lateral_cm'] = it.get('lateral_cm')
                base_payload['fundo_cm'] = it.get('fundo_cm')
                base_payload['incluir_alca'] = bool(it.get('incluir_alca'))
                # Força cálculo com IE para não gerar DIFAL: usa a alíquota estadual da gramatura
                base_payload['cliente_tem_ie'] = True
                base_payload['incluir_lateral'] = True
                base_payload['incluir_fundo'] = bool(it.get('fundo_cm'))

                try:
                    res = client.post('/api/calcular_preco', json=base_payload)
                    data = res.get_json() if res else None
                except Exception:
                    res = None
                    data = None

                if not res or res.status_code != 200 or not data:
                    resultados.append({
                        'nome': it.get('nome') or '-',
                        'erro': res.status_code if res else 'erro',
                        'dados': base_payload,
                        **it,
                    })
                    continue

                data['nome'] = it.get('nome') or '-'
                data['largura_cm'] = it.get('largura_cm') if it.get('largura_cm') not in (None, '') else data.get('largura_cm')
                data['altura_cm'] = it.get('altura_cm') if it.get('altura_cm') not in (None, '') else (data.get('altura_cm') or data.get('altura_produto_cm'))
                data['lateral_cm'] = it.get('lateral_cm') if it.get('lateral_cm') not in (None, '') else data.get('lateral_cm')
                data['fundo_cm'] = it.get('fundo_cm') if it.get('fundo_cm') not in (None, '') else data.get('fundo_cm')
                data['incluir_alca'] = bool(it.get('incluir_alca'))
                data['quantidade'] = base_payload.get('quantidade') or data.get('quantidade')
                resultados.append(data)
    except Exception as e:
        return jsonify({'error': f'Erro ao calcular itens: {str(e)}'}), 500

    try:
        # Monta PDF inspirado no layout comercial fornecido
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=25, leftMargin=25, topMargin=25, bottomMargin=25)
        styles = getSampleStyleSheet()

        azul = colors.HexColor('#2F80ED')
        cinza_claro = colors.HexColor('#F2F4F7')
        cinza_grid = colors.HexColor('#E0E0E0')
        cinza_texto = colors.HexColor('#111827')

        styles.add(ParagraphStyle(name='Titulo', parent=styles['Heading1'], fontSize=16, textColor=cinza_texto, alignment=TA_RIGHT, leading=18))
        styles.add(ParagraphStyle(name='Logo', parent=styles['Normal'], fontSize=22, textColor=cinza_texto, leading=24))
        styles.add(ParagraphStyle(name='SectionTitle', parent=styles['Normal'], fontSize=11.5, textColor=cinza_texto, spaceAfter=6, spaceBefore=4, leading=14))
        styles.add(ParagraphStyle(name='SectionTitleCenter', parent=styles['SectionTitle'], alignment=TA_CENTER))
        styles.add(ParagraphStyle(name='Muted', parent=styles['Normal'], textColor=colors.HexColor('#6b7280'), fontSize=9.5, leading=12))
        styles.add(ParagraphStyle(name='Cell', parent=styles['Normal'], textColor=cinza_texto, fontSize=10, leading=12))
        styles.add(ParagraphStyle(name='CellBold', parent=styles['Normal'], textColor=cinza_texto, fontSize=10, leading=12, fontName='Helvetica-Bold'))
        styles.add(ParagraphStyle(name='Footer', parent=styles['Normal'], fontSize=10, textColor=cinza_texto, alignment=TA_CENTER, leading=14))

        story = []
        agora = datetime.now()

        def fmt_money(val):
            try:
                num = float(val)
                return f"R$ {num:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
            except Exception:
                return '-'

        def fmt_num(val):
            try:
                num = float(val)
                return f"{num:,.0f}".replace(',', '.')
            except Exception:
                return '-' if val in (None, '', '-') else str(val)

        # ===== Cabeçalho =====
        header = Table(
            [[
                Paragraph("<b>Eco<span color='#2F80ED'>Fiber</span></b>", styles['Logo']),
                Paragraph("<b>COTAÇÃO COMERCIAL</b>", styles['Titulo'])
            ]],
            colWidths=[95*mm, 75*mm]
        )
        header.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ]))
        story.append(header)
        story.append(Spacer(1, 4))
        story.append(Table([[""],[" "]], colWidths=[doc.width], style=[('LINEABOVE',(0,0),(-1,0),0.8,cinza_grid)]))
        story.append(Spacer(1, 10))

        # ===== Dados gerais =====
        empresa_nome = 'FiberTNT'
        estado_val = contexto.get('estado') or '—'
        qtd_val = contexto.get('quantidade') or (resultados[0].get('quantidade') if resultados else None)
        qtd_txt = (f"{int(qtd_val):,}".replace(',', '.') + ' unidades') if qtd_val else '—'
        data_txt = agora.strftime('%d/%m/%Y')
        hora_txt = agora.strftime('%H:%M')
        validade_txt = '7 dias'
        cliente_tem_ie_ctx = bool(contexto.get('cliente_tem_ie'))
        ie_txt = 'Sim' if cliente_tem_ie_ctx else 'Não'
        try:
            raw_icms_header = resultados[0].get('icms_percentual') if resultados else None
            icms_header_pct = float(raw_icms_header) if raw_icms_header is not None else None
        except Exception:
            icms_header_pct = None
        icms_header_txt = f"{icms_header_pct:.2f}%" if icms_header_pct is not None else '—'

        dados = Table(
            [
                ['Empresa:', empresa_nome, 'Data:', data_txt],
                ['Estado:', estado_val, 'Hora:', hora_txt],
                ['Quantidade:', qtd_txt, 'Validade:', validade_txt],
                ['Possui IE?', ie_txt, 'ICMS:', icms_header_txt],
            ],
            colWidths=[27*mm, 60*mm, 22*mm, 40*mm]
        )
        dados.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, cinza_grid),
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONT', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(dados)
        story.append(Spacer(1, 12))

        # ===== Título da tabela de produto =====
        story.append(Table(
            [[Paragraph('<b>DADOS DOS PRODUTOS</b>', styles['SectionTitleCenter'])]],
            colWidths=[doc.width],
            style=[
                ('BACKGROUND', (0, 0), (-1, -1), cinza_claro),
                ('PADDING', (0, 0), (-1, -1), 7),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ]
        ))

        # ===== Tabela principal =====
        header_cols = ['Nº', 'Descrição', 'Largura', 'Altura', 'Lateral', 'Fundo', 'Preço unit.', 'Preço total']
        rows = [header_cols]

        for idx, r in enumerate(resultados, start=1):
            preco_val = float(r.get('preco_final') or 0)
            quantidade_val = float(r.get('quantidade') or contexto.get('quantidade') or 0)
            preco_unit = preco_val / quantidade_val if quantidade_val else None

            rows.append([
                str(idx),
                r.get('nome') or '-',
                fmt_num(r.get('largura_cm')),
                fmt_num(r.get('altura_cm')),
                'Não' if not r.get('lateral_cm') else fmt_num(r.get('lateral_cm')),
                'Não' if not r.get('fundo_cm') else fmt_num(r.get('fundo_cm')),
                fmt_money(preco_unit) if preco_unit is not None else '-',
                fmt_money(preco_val),
            ])

        tabela_styles = [
            ('BACKGROUND', (0, 0), (-1, 0), azul),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, cinza_grid),
            ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONT', (0, 1), (-1, -1), 'Helvetica'),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
            ('ALIGN', (-2, 1), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]
        tabela = Table(rows, repeatRows=1, colWidths=[10*mm, 64*mm, 16*mm, 16*mm, 16*mm, 16*mm, 24*mm, 26*mm])
        tabela.setStyle(TableStyle(tabela_styles))
        story.append(tabela)
        story.append(Spacer(1, 26))

        # ===== Serviços (NF serviço) — opcional =====
        servicos_ctx = contexto.get('servicos') or []
        if servicos_ctx:
            story.append(Table(
                [[Paragraph('<b>SERVIÇOS</b>', styles['SectionTitleCenter'])]],
                colWidths=[doc.width],
                style=[
                    ('BACKGROUND', (0, 0), (-1, -1), cinza_claro),
                    ('PADDING', (0, 0), (-1, -1), 7),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ]
            ))

            qtd_val = contexto.get('quantidade') or (resultados[0].get('quantidade') if resultados else 0) or 0
            srv_rows = [['Serviço', 'Preço unit.', 'Valor total']]
            for svc in servicos_ctx:
                try:
                    val = float(svc.get('valor') or 0)
                except Exception:
                    val = 0.0
                try:
                    imp_pct = float(svc.get('imposto_percentual') if 'imposto_percentual' in svc else svc.get('impostos') or 0)
                except Exception:
                    imp_pct = 0.0
                unit_with_tax = val + (val * imp_pct / 100.0)
                total_val = unit_with_tax * float(qtd_val or 0)
                srv_rows.append([
                    svc.get('nome') or 'Serviço',
                    fmt_money(unit_with_tax),
                    fmt_money(total_val),
                ])

            # Usa a mesma largura total da tabela de produtos: 188 mm (64 + 44 + 80)
            srv_table = Table(srv_rows, repeatRows=1, colWidths=[64*mm, 44*mm, 80*mm])
            srv_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), azul),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, cinza_grid),
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONT', (0, 1), (-1, -1), 'Helvetica'),
                ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('PADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(srv_table)
            story.append(Spacer(1, 22))

        # ===== Condições comerciais =====
        story.append(Paragraph('<b>CONDIÇÕES COMERCIAIS</b>', styles['SectionTitle']))
        story.append(Spacer(1, 4))
        condicoes = [
            '• Valores expressos em reais (R$)',
            '• Quanto maior a quantidade, melhores as condições de negociação',
            '• Frete não incluso (a calcular conforme CEP)',
            '• Produção mediante aprovação da cotação',
        ]
        for c in condicoes:
            story.append(Paragraph(c, styles['Cell']))
        story.append(Spacer(1, 14))

        # ===== Observações =====
        story.append(Paragraph('<b>OBSERVAÇÕES</b>', styles['SectionTitle']))
        story.append(Spacer(1, 4))
        story.append(Paragraph('Caso deseje personalização, alteração de medidas ou inclusão de alça, favor solicitar nova simulação.', styles['Cell']))
        story.append(Spacer(1, 18))

        # ===== Rodapé =====
        story.append(Paragraph('<b>FIBERTNT BRASIL</b><br/>contato@fibertnt.com.br | São Paulo – SP', styles['Footer']))

        doc.build(story)
        buffer.seek(0)

        filename = f"calculo-lote-precos-{agora.strftime('%Y-%m-%d')}.pdf"
        return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({'error': f'Erro ao gerar PDF: {str(e)}'}), 500
# Configurações (margem/outros/tema/notificações)
@api_bp.route('/configuracoes', methods=['GET'])
def get_configs():
    try:
        return jsonify(get_configuracoes(require_existing=True))
    except LookupError as e:
        return jsonify({'error': str(e)}), 404

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
    try:
        return jsonify(get_configuracoes(require_existing=True))
    except LookupError as e:
        return jsonify({'error': str(e)}), 404


# Consultar todas gramaturas
@api_bp.route('/gramaturas', methods=['GET'])
def get_gramaturas():
    gramaturas = Gramatura.get_all()
    return jsonify([
        {
            'id': g.id,
            'gramatura': g.gramatura,
            'preco': g.preco,
            'altura_cm': g.altura_cm,
            'icms_estadual': g.icms_estadual,
        }
        for g in gramaturas
    ])

# Consultar todos impostos fixos
@api_bp.route('/impostos_fixos', methods=['GET'])
def get_impostos_fixos():
    client = get_client()
    ensure_impostos_fixos_defaults()
    resp = client.table('impostos').select('id, nome, valor').execute()
    rows = resp.data or []
    # Ordena pelo IMPOSTOS_ORDEM; desconhecidos ficam ao final ordenados alfabeticamente
    ordem_index = {nome: idx for idx, nome in enumerate(IMPOSTOS_ORDEM)}
    rows.sort(key=lambda r: (ordem_index.get(r.get('nome'), len(IMPOSTOS_ORDEM) + 1), (r.get('nome') or '').lower()))
    impostos = [
        {'id': row.get('id'), 'nome': row.get('nome'), 'valor': float(row.get('valor') or 0.0)}
        for row in rows
    ]
    return jsonify(impostos)

# Criar imposto fixo
@api_bp.route('/impostos_fixos', methods=['POST'])
def create_imposto_fixo():
    # Criação de novos impostos não é permitida; apenas atualização de valores
    return jsonify({'error': 'Não é permitido criar novos impostos fixos. Atualize o valor dos existentes.'}), 405

# Atualizar imposto fixo
@api_bp.route('/impostos_fixos/<int:id>', methods=['PUT'])
def update_imposto_fixo(id: int):
    data = request.get_json() or {}
    valor = data.get('valor')
    if valor is None:
        return jsonify({'error': 'Informe valor para atualizar'}), 400
    client = get_client()
    updates = {}
    updates['valor'] = float(valor)
    client.table('impostos').update(updates).eq('id', id).execute()
    return jsonify({'message': 'Imposto fixo atualizado', 'id': id, 'valor': float(valor)})

# Deletar imposto fixo
@api_bp.route('/impostos_fixos/<int:id>', methods=['DELETE'])
def delete_imposto_fixo(id: int):
    return jsonify({'error': 'Exclusão de impostos fixos não é permitida'}), 405

# CRUD Serviços (ex.: Silk)
@api_bp.route('/servicos', methods=['GET'])
def get_servicos():
    client = get_client()
    # Tabela tem colunas: id, nome, valor, impostos (não há imposto_percentual)
    resp = client.table('servicos').select('id, nome, valor, impostos').order('id').execute()
    servicos = [
        {
            'id': row.get('id'),
            'nome': row.get('nome'),
            'valor': float(row.get('valor') or 0.0),
            'imposto_percentual': float(row.get('impostos') or 0.0),
        }
        for row in (resp.data or [])
    ]
    return jsonify(servicos)


@api_bp.route('/servicos', methods=['POST'])
def create_servico():
    data = request.get_json() or {}
    nome = data.get('nome')
    valor = data.get('valor')
    imposto_percentual = data.get('imposto_percentual') if 'imposto_percentual' in data else data.get('impostos')
    if not nome or valor is None:
        return jsonify({'error': 'Campos nome e valor são obrigatórios'}), 400
    try:
        valor_f = float(valor)
        imposto_f = float(imposto_percentual or 0.0)
    except Exception:
        return jsonify({'error': 'Valor ou imposto inválido'}), 400
    client = get_client()
    resp = client.table('servicos').insert({
        'nome': nome,
        'valor': valor_f,
        'impostos': imposto_f,
    }).execute()
    new_id = resp.data[0].get('id') if resp.data else None
    return jsonify({'id': new_id, 'nome': nome, 'valor': valor_f, 'imposto_percentual': imposto_f}), 201


@api_bp.route('/servicos/<int:id>', methods=['PUT'])
def update_servico(id: int):
    data = request.get_json() or {}
    nome = data.get('nome')
    valor = data.get('valor')
    imposto_percentual = data.get('imposto_percentual') if 'imposto_percentual' in data else data.get('impostos')
    updates = {}
    if nome is not None:
        updates['nome'] = nome
    if valor is not None:
        try:
            updates['valor'] = float(valor)
        except Exception:
            return jsonify({'error': 'Valor inválido'}), 400
    if imposto_percentual is not None:
        try:
            imposto_f = float(imposto_percentual)
        except Exception:
            return jsonify({'error': 'Imposto inválido'}), 400
        updates['impostos'] = imposto_f
    if not updates:
        return jsonify({'error': 'Informe nome, valor ou imposto_percentual para atualizar'}), 400
    client = get_client()
    client.table('servicos').update(updates).eq('id', id).execute()
    return jsonify({'message': 'Serviço atualizado'})


@api_bp.route('/servicos/<int:id>', methods=['DELETE'])
def delete_servico(id: int):
    client = get_client()
    client.table('servicos').delete().eq('id', id).execute()
    return jsonify({'message': 'Serviço removido'})

# CRUD sacolas_lote (Supabase)
@api_bp.route('/sacolas_lote', methods=['GET'])
def listar_sacolas_lote():
    client = get_client()
    resp = client.table('sacolas_lote').select('*').order('id').execute()
    return jsonify(resp.data or [])


@api_bp.route('/sacolas_lote', methods=['POST'])
def criar_sacola_lote():
    data = request.get_json() or {}
    try:
        nome = (data.get('nome') or '').strip()
        largura_cm = float(data.get('largura_cm'))
        altura_cm = float(data.get('altura_cm'))
    except Exception:
        return jsonify({'error': 'Campos nome, largura_cm e altura_cm são obrigatórios e devem ser válidos.'}), 400
    lateral_cm = data.get('lateral_cm')
    fundo_cm = data.get('fundo_cm')
    tem_alca = bool(data.get('tem_alca'))

    payload = {
        'nome': nome,
        'largura_cm': float(largura_cm),
        'altura_cm': float(altura_cm),
        'lateral_cm': float(lateral_cm) if lateral_cm not in (None, '') else None,
        'fundo_cm': float(fundo_cm) if fundo_cm not in (None, '') else None,
        'tem_alca': tem_alca,
    }
    client = get_client()
    resp = client.table('sacolas_lote').insert(payload).execute()
    created = resp.data[0] if resp.data else payload
    return jsonify(created), 201


@api_bp.route('/sacolas_lote/<int:id>', methods=['PUT'])
def atualizar_sacola_lote(id: int):
    data = request.get_json() or {}
    updates = {}

    if 'nome' in data:
        updates['nome'] = (data.get('nome') or '').strip()
    if 'largura_cm' in data:
        try:
            updates['largura_cm'] = float(data.get('largura_cm'))
        except Exception:
            return jsonify({'error': 'largura_cm inválida'}), 400
    if 'altura_cm' in data:
        try:
            updates['altura_cm'] = float(data.get('altura_cm'))
        except Exception:
            return jsonify({'error': 'altura_cm inválida'}), 400
    if 'lateral_cm' in data:
        updates['lateral_cm'] = float(data.get('lateral_cm')) if data.get('lateral_cm') not in (None, '') else None
    if 'fundo_cm' in data:
        updates['fundo_cm'] = float(data.get('fundo_cm')) if data.get('fundo_cm') not in (None, '') else None
    if 'tem_alca' in data:
        updates['tem_alca'] = bool(data.get('tem_alca'))

    if not updates:
        return jsonify({'error': 'Nada para atualizar'}), 400

    client = get_client()
    resp = client.table('sacolas_lote').update(updates).eq('id', id).execute()
    return jsonify(resp.data[0] if resp.data else {**updates, 'id': id})


@api_bp.route('/sacolas_lote/<int:id>', methods=['DELETE'])
def remover_sacola_lote(id: int):
    client = get_client()
    client.table('sacolas_lote').delete().eq('id', id).execute()
    return jsonify({'message': 'Removido'})

# Adicionar gramatura
@api_bp.route('/gramaturas', methods=['POST'])
def add_gramatura():
    data = request.get_json()
    gram = data.get('gramatura')
    preco = data.get('preco')
    altura = data.get('altura_cm')
    icms_estadual = data.get('icms_estadual')
    try:
        icms_estadual = float(icms_estadual) if icms_estadual not in (None, '') else None
    except Exception:
        icms_estadual = None
    Gramatura.add(gram, preco, altura, icms_estadual)
    return jsonify({'message': 'Gramatura adicionada!'}), 201

# Editar gramatura
@api_bp.route('/gramaturas/<int:id>', methods=['PUT'])
def edit_gramatura(id):
    data = request.get_json()
    client = get_client()
    updates = {
        'gramatura': data.get('gramatura'),
        'preco': data.get('preco'),
    }
    if 'altura_cm' in data:
        updates['altura_cm'] = data.get('altura_cm')
    if 'icms_estadual' in data:
        try:
            updates['icms_estadual'] = float(data.get('icms_estadual')) if data.get('icms_estadual') not in (None, '') else None
        except Exception:
            updates['icms_estadual'] = None
    client.table('gramaturas').update(updates).eq('id', id).execute()
    return jsonify({'message': 'Gramatura editada!'})

# Deletar gramatura
@api_bp.route('/gramaturas/<int:id>', methods=['DELETE'])
def delete_gramatura(id):
    client = get_client()
    client.table('gramaturas').delete().eq('id', id).execute()
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
    # Silk legado (mantido para compatibilidade, mas padrão é não incluir)
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

    # Serviços (lista) — cada item pode ter valor e imposto_percentual
    servicos_payload = data.get('servicos') or []
    servicos_detalhe = []
    valor_servicos_unit = 0.0
    try:
        for svc in servicos_payload:
            try:
                val = float(svc.get('valor', 0) or 0)
            except Exception:
                val = 0.0
            try:
                imp_pct = float(svc.get('imposto_percentual', svc.get('impostos', 0)) or 0)
            except Exception:
                imp_pct = 0.0
            val_com_imposto = val + (val * imp_pct / 100.0)
            valor_servicos_unit += val_com_imposto
            servicos_detalhe.append({
                'id': svc.get('id'),
                'nome': svc.get('nome'),
                'valor_unitario': round(val, 4),
                'imposto_percentual': round(imp_pct, 4),
                'valor_unitario_com_imposto': round(val_com_imposto, 4),
            })
    except Exception:
        servicos_detalhe = []
        valor_servicos_unit = 0.0
    estado = (data.get('estado') or '').strip().upper() or None
    cliente_tem_ie = bool(data.get('cliente_tem_ie', False))

    # Buscar gramatura (inclui alíquota estadual guardada na gramatura)
    client = get_client()
    if gramatura_id:
        resp_gram = client.table('gramaturas').select('preco, gramatura, altura_cm, icms_estadual').eq('id', gramatura_id).limit(1).execute()
    elif gramatura_nome:
        resp_gram = client.table('gramaturas').select('preco, gramatura, altura_cm, icms_estadual').eq('gramatura', gramatura_nome).limit(1).execute()
    else:
        return jsonify({'error': 'Informe gramatura_id ou gramatura_nome'}), 400
    row = resp_gram.data[0] if resp_gram.data else None
    if not row:
        return jsonify({'error': 'Gramatura não encontrada'}), 404
    custo_un = float(row.get('preco') or 0)
    gramatura_nome = row.get('gramatura')
    altura_cm_db = float(row.get('altura_cm')) if row.get('altura_cm') is not None else None
    icms_estadual_gram = None
    try:
        icms_estadual_gram = float(row.get('icms_estadual')) if row.get('icms_estadual') is not None else None
    except Exception:
        icms_estadual_gram = None

    # Determinar ICMS: com IE usa alíquota estadual guardada na gramatura (difal/interestadual); sem IE usa tabela padrão por UF
    if cliente_tem_ie:
        icms = icms_estadual_gram if icms_estadual_gram is not None else 0.0
        icms_origem = 'icms_estadual_gramatura' if icms_estadual_gram is not None else 'icms_zero_ie_sem_aliquota'
    else:
        icms = float(ICMS_ESTADO_PADRAO.get(estado, 0.0)) if estado else 0.0
        icms_origem = 'icms_estado_padrao' if estado else 'icms_zero_sem_estado'
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
    resp_impostos = client.table('impostos').select('nome, valor').execute()
    impostos_fixos_raw = resp_impostos.data or []
    # Filtra ICMS da lista de impostos fixos para evitar duplicidade (ICMS do produto já é calculado separado)
    impostos_fixos = [imp for imp in impostos_fixos_raw if (imp.get('nome') or '').strip().upper() != 'ICMS']
    total_impostos_fixos = sum([float(imp.get('valor') or 0) for imp in impostos_fixos])
    impostos_detalhe = [{'nome': imp.get('nome'), 'percentual': float(imp.get('valor') or 0)} for imp in impostos_fixos]

    # Decimais originais (antes de eventual desconto que reduz a margem)
    margem_decimal_original = margem / 100
    comissao_decimal = comissao / 100
    outros_custos_decimal = outros_custos / 100
    impostos_decimal = total_impostos_fixos / 100
    icms_decimal = icms / 100

    # Custo por unidade do material (sem silk) — silk será tratado como serviço separado (NF de serviço)
    # Ajustes de dimensão: lateral dobra (2x) e soma à largura; fundo soma à altura (sem dobrar)
    lateral_effective = (lateral_cm or 0) * 2.0
    largura_used = float(largura_cm or 0) + lateral_effective

    # custo por unidade considera a largura efetiva usada
    custo_material_unit = custo_un * (largura_used / 100)
    # custo_real agora representa apenas o custo do produto (sem serviço)
    custo_real = round(custo_material_unit, 2)

    # Quantidade total considerada inclui perdas de calibração (unidades extras)
    quantidade_total = max(0, quantidade + max(0, perdas_calibracao_un))

    # Total de silk (por unidade x quantidade solicitada) — serviço faturado separado, sem perdas
    valor_silk_total = round((valor_silk_unit or 0) * quantidade, 2)
    # Total de serviços (lista) — por unidade x quantidade, sem perdas
    valor_servicos_total = round((valor_servicos_unit or 0) * quantidade, 2)

    # Custo total do produto (sem silk), inclui perdas de calibração
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

    # Preço final do PRODUTO (sem serviços) resolve a equação: P = custo_total + total_percentual * P  =>  P = custo_total / (1 - total_percentual)
    denom = max(1e-9, (1 - total_percentual))
    preco_final_produto = round(custo_total / denom, 2)

    # Serviços (silk) são somados por fora, sem incidência de impostos percentuais
    preco_final_total = round(preco_final_produto + valor_silk_total + valor_servicos_total, 2)

    # Decomposição: percentuais incidem sobre o preço final (já com margem aplicada)
    valor_margem = round(preco_final_produto * margem_decimal_aplicada, 2)
    valor_comissao = round(preco_final_produto * comissao_decimal, 2)
    valor_outros = round(preco_final_produto * outros_custos_decimal, 2)
    valor_impostos = round(preco_final_produto * impostos_decimal, 2)
    valor_icms = round(preco_final_produto * icms_decimal, 2)

    # Valor economizado por causa do desconto na margem (diferença entre sem desconto e com margem aplicada)
    valor_desconto = round(preco_final_sem_desconto - preco_final_produto, 2) if incluir_desconto else 0.0

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
    # custo_real: custo por unidade do produto (sem serviços)
    'custo_real': round(custo_real, 2),
    'custo_total': custo_total,
        'margem_percentual': margem,
        'comissao_percentual': comissao,
        'outros_custos_percentual': outros_custos,
        'impostos_fixos_percentual': round(total_impostos_fixos, 2),
    'icms_percentual': round(icms, 2),
    'icms_origem': icms_origem,
        'impostos_fixos_detalhe': impostos_detalhe,
        'quantidade': quantidade,
        'perdas_calibracao_un': perdas_calibracao_un,
        'quantidade_total': quantidade_total,
        'valor_margem': valor_margem,
        'valor_comissao': valor_comissao,
        'valor_outros': valor_outros,
        'valor_impostos_fixos': valor_impostos,
        'valor_icms': valor_icms,
    # Serviços (ex.: silk) faturados em NF de serviço
    'valor_silk': valor_silk_total,  # compatibilidade
    'valor_silk_unitario': round(valor_silk_unit, 2),
    'valor_silk_total': valor_silk_total,
    'valor_servicos_unitario': round(valor_servicos_unit, 2),
    'valor_servicos_total': valor_servicos_total,
    'servicos_detalhe': servicos_detalhe,
        'incluir_valor_silk': incluir_valor_silk,
        'incluir_lateral': incluir_lateral,
        'incluir_alca': incluir_alca,
    'incluir_fundo': incluir_fundo,
    'lateral_cm': lateral_cm,
    'fundo_cm': fundo_cm,
    'largura_utilizada_cm': round(largura_used, 2),
    'altura_utilizada_cm': round(altura_unit_effective_value, 2) if altura_unit_effective_value is not None else None,
    # Preços: produto separado de serviços
    'preco_final_produto': preco_final_produto,
    'preco_final_servicos': valor_silk_total + valor_servicos_total,
    'preco_final': preco_final_total,  # mantém campo antigo como total (produto + serviços)
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

