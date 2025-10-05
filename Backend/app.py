from flask import Flask, request, jsonify
import sqlite3
import os

app = Flask(__name__)

DB_PATH = os.environ.get('DB_PATH', 'app/database.db')


def calcular_preco_final(custo_un, largura_cm, imposto, margem, comissao, outros_custos, quantidade, ):
    imposto_decimal = imposto / 100
    margem_decimal = margem / 100
    comissao_decimal = comissao / 100
    outros_custos_decimal = outros_custos / 100
    custo_real = custo_un * (largura_cm / 100)

    print(f"""
    --- Informações do cálculo ---
    custo_un: {custo_un}
    largura_cm: {largura_cm}
    imposto: {imposto} ({imposto_decimal})
    margem: {margem} ({margem_decimal})
    comissao: {comissao} ({comissao_decimal})
    outros_custos: {outros_custos} ({outros_custos_decimal})
    quantidade: {quantidade}
    custo_real: {custo_real}
    """)

    preco_final = (custo_real / (1 - (margem_decimal + imposto_decimal + comissao_decimal + outros_custos_decimal))) * quantidade
    print(f"preco_final calculado: {preco_final}")
    return round(preco_final, 2)


def decompor_preco(preco_final, custo, imposto, margem):
    imposto_decimal = imposto / 100
    margem_decimal = margem / 100

    # Valores em R$ de imposto e margem
    valor_imposto = preco_final * imposto_decimal
    valor_margem = preco_final * margem_decimal

    return {
        "custo": round(custo, 2),
        "margem_reais": round(valor_margem, 2),
        "imposto_reais": round(valor_imposto, 2),
        "preco_final": round(preco_final, 2),
        "check": round(custo + valor_margem + valor_imposto, 2)
    }


@app.route('/calcular_preco_final', methods=['POST'])
def calcular_preco_final_api():
    data = request.get_json()
    gramatura_id = data.get('gramatura_id')
    gramatura_nome = data.get('gramatura_nome')
    largura_cm = float(data.get('largura_cm', 0))
    imposto = float(data.get('imposto', 0))
    margem = float(data.get('margem', 0))
    comissao = float(data.get('comissao', 0))
    outros_custos = float(data.get('outros_custos', 0))
    quantidade = int(data.get('quantidade', 1))

    # Buscar gramatura
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    if gramatura_id:
        cursor.execute('SELECT preco, gramatura FROM gramaturas WHERE id=?', (gramatura_id,))
    elif gramatura_nome:
        cursor.execute('SELECT preco, gramatura FROM gramaturas WHERE gramatura=?', (gramatura_nome,))
    else:
        return jsonify({'error': 'Informe gramatura_id ou gramatura_nome'}), 400
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Gramatura não encontrada'}), 404
    custo_un, gramatura_nome = row

    imposto_decimal = imposto / 100
    margem_decimal = margem / 100
    comissao_decimal = comissao / 100
    outros_custos_decimal = outros_custos / 100
    custo_real = custo_un * (largura_cm / 100)

    preco_final = (custo_real / (1 - (margem_decimal + imposto_decimal + comissao_decimal + outros_custos_decimal))) * quantidade

    valor_imposto = preco_final * imposto_decimal
    valor_margem = preco_final * margem_decimal
    valor_comissao = preco_final * comissao_decimal
    valor_outros = preco_final * outros_custos_decimal

    return jsonify({
        'gramatura_nome': gramatura_nome,
        'custo_un': round(custo_un, 2),
        'largura_cm': largura_cm,
        'custo_real': round(custo_real, 2),
        'imposto_percentual': imposto,
        'margem_percentual': margem,
        'comissao_percentual': comissao,
        'outros_custos_percentual': outros_custos,
        'quantidade': quantidade,
        'valor_imposto': round(valor_imposto, 2),
        'valor_margem': round(valor_margem, 2),
        'valor_comissao': round(valor_comissao, 2),
        'valor_outros': round(valor_outros, 2),
        'preco_final': round(preco_final, 2),
        'check': round(custo_real + valor_margem + valor_imposto + valor_comissao + valor_outros, 2)
    })


def calcular():
    data = request.get_json()

    custo = float(data.get("custo", 0))
    margem = float(data.get("margem", 0))
    imposto = float(data.get("imposto", 0))

    preco_final = calcular_preco_final(custo, imposto, margem)
    resultado = decompor_preco(preco_final, custo, imposto, margem)

    return jsonify(resultado)


print(calcular_preco_final(1, 40, 10, 10, 1, 2, 1000))

if __name__ == '__main__':
    # Execução direta apenas para depuração rápida
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', '5001'))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes', 'on')
    app.run(host=host, port=port, debug=debug)

