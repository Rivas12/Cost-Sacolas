"""
Módulo de cálculo de preços para sacolas.
Extrai a lógica do endpoint /calcular_preco em funções reutilizáveis.
"""

import math
from typing import Dict, List, Tuple, Optional, Any


# Estados do Brasil por região
ESTADOS_SUL_SUDESTE = {'SP', 'RJ', 'MG', 'PR', 'SC', 'RS'}
ESTADOS_NORTE_NE_CO_ES = {
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO', 'RR', 'SE', 'TO'
}

ICMS_CONSUMIDOR_FINAL = {
    "AC": 19.0, "AL": 19.0, "AM": 20.0, "AP": 18.0, "BA": 20.5,
    "CE": 20.0, "DF": 20.0, "ES": 17.0, "GO": 19.0, "MA": 23.0,
    "MT": 17.0, "MS": 17.0, "MG": 18.0, "PA": 19.0, "PB": 20.0,
    "PR": 19.5, "PE": 20.5, "PI": 22.5, "RJ": 20.0, "RN": 20.0,
    "RS": 17.0, "RO": 19.5, "RR": 20.0, "SC": 17.0, "SP": 18.0,
    "SE": 19.0, "TO": 20.0,
}


def calcular_icms_interestadual(estado_origem: str, estado_destino: str) -> float:
    """
    Calcula alíquota de ICMS interestadual conforme regras fiscais brasileiras.
    
    Args:
        estado_origem: Sigla do estado de origem (ex: 'SP')
        estado_destino: Sigla do estado de destino (ex: 'BA')
    
    Returns:
        Alíquota em percentual (7.0 ou 12.0)
    """
    origem = (estado_origem or '').upper().strip()
    destino = (estado_destino or '').upper().strip()
    
    if not origem or not destino:
        return 0.0
    
    if origem in ESTADOS_SUL_SUDESTE:
        return 12.0 if destino in ESTADOS_SUL_SUDESTE else 7.0
    else:
        return 12.0


def determinar_icms(
    cliente_tem_ie: bool,
    estado: Optional[str],
    estado_empresa: str = 'SP'
) -> Tuple[float, str]:
    """
    Determina alíquota ICMS e sua origem.
    
    Regras:
    - MESMO estado (intraestadual): SEMPRE 18% completo, independente de IE
    - OUTRO estado COM IE: ICMS interestadual (7% ou 12% conforme regra de origem/destino)
    - OUTRO estado SEM IE: ICMS completo do estado destino
    
    Args:
        cliente_tem_ie: Se cliente tem Inscrição Estadual
        estado: UF do cliente
        estado_empresa: UF da empresa (padrão 'SP')
    
    Returns:
        Tupla (aliquota_icms, icms_origem)
    """
    if estado and estado == estado_empresa:
        # Operação INTRAESTADUAL: sempre alíquota completa, com ou sem IE
        icms = float(ICMS_CONSUMIDOR_FINAL.get(estado, 0.0)) if estado else 0.0
        origem = 'icms_completo_intraestadual'
    elif cliente_tem_ie:
        # Operação INTERESTADUAL com IE: usa interestadual
        icms = calcular_icms_interestadual(estado_empresa, estado) if estado else 0.0
        origem = 'icms_interestadual_ie' if estado else 'icms_zero_sem_estado'
    else:
        # Operação INTERESTADUAL sem IE: alíquota completa do estado
        icms = float(ICMS_CONSUMIDOR_FINAL.get(estado, 0.0)) if estado else 0.0
        origem = 'icms_completo_consumidor_final' if estado else 'icms_zero_sem_estado'
    
    return icms, origem


def processar_servicos(servicos_payload: List[Dict]) -> Tuple[List[Dict], float]:
    """
    Processa lista de serviços (silk) com cálculo de impostos.
    
    Args:
        servicos_payload: Lista de serviços do payload
    
    Returns:
        Tupla (servicos_detalhe, valor_servicos_unitario)
    """
    servicos_detalhe = []
    valor_servicos_unit = 0.0
    
    try:
        for svc in (servicos_payload or []):
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
        pass
    
    return servicos_detalhe, valor_servicos_unit


def calcular_custos_adicionais(
    quantidade: int,
    custos_db: List[Dict]
) -> Tuple[List[Dict], float]:
    """
    Calcula custos adicionais baseado em quantidade e regra "a_cada".
    
    Args:
        quantidade: Quantidade de unidades
        custos_db: Lista de custos do banco de dados
    
    Returns:
        Tupla (custos_lista, valor_total)
    """
    custos_lista = []
    valor_total = 0.0
    
    try:
        for custo in (custos_db or []):
            nome = custo.get('nome') or ''
            valor = float(custo.get('valor') or 0)
            a_cada = int(custo.get('a_cada') or 1)
            
            if valor <= 0 or a_cada <= 0:
                continue
            
            qtd_custos = max(1, math.ceil(quantidade / a_cada))
            valor_item = round(valor * qtd_custos, 2)
            valor_total += valor_item
            
            custos_lista.append({
                'nome': nome,
                'valor_unitario': valor,
                'a_cada': a_cada,
                'quantidade': qtd_custos,
                'valor_total': valor_item,
            })
    except Exception:
        pass
    
    return custos_lista, round(valor_total, 2)


def calcular_custo_base(
    custo_total: float,
    perdas_calibracao_valor: float,
    valor_cordao_total: float,
    custos_adicionais_total: float
) -> float:
    """Calcula custo base = material + perdas + cordão + adicionais."""
    return round(
        custo_total + perdas_calibracao_valor + valor_cordao_total + custos_adicionais_total,
        2
    )


def calcular_preco_final(
    custo_base: float,
    margem_dec: float,
    impostos_sem_icms_dec: float,
    icms_dec: float,
    comissao_dec_aplicada: float,
    ipi_dec: float
) -> Dict[str, Any]:
    """
    Calcula preços de forma CORRETA usando método: Aplicar ÷ (1 + p) | Desfazer × (1 + p)
    
    Funciona para QUALQUER cenário: intraestadual, interestadual, com/sem IE, etc.
    A diferença de IE/estado afeta apenas o ICMS%, não a lógica de cálculo.
    
    Args:
        custo_base: Custo base (material + perdas + cordão + adicionais)
        margem_dec: Margem em decimal (ex: 0.30 = 30%)
        impostos_sem_icms_dec: Impostos fixos (PIS, COFINS, etc) em decimal
        icms_dec: ICMS em decimal
        comissao_dec_aplicada: Comissão em decimal
        ipi_dec: IPI em decimal
    
    Returns:
        Dicionário com preço final e componentes
    """
    # Aplicar todas as taxas de forma multiplicativa: preço ÷ (1 - taxa)
    preco_sem_ipi = custo_base
    
    # Aplicar Margem
    if margem_dec > 0 and margem_dec < 1.0:
        preco_sem_ipi = preco_sem_ipi / (1 - margem_dec)
    
    # Aplicar Impostos (exceto ICMS)
    if impostos_sem_icms_dec > 0 and impostos_sem_icms_dec < 1.0:
        preco_sem_ipi = preco_sem_ipi / (1 - impostos_sem_icms_dec)
    
    # Aplicar Comissão
    if comissao_dec_aplicada > 0 and comissao_dec_aplicada < 1.0:
        preco_sem_ipi = preco_sem_ipi / (1 - comissao_dec_aplicada)
    
    # Aplicar ICMS
    if icms_dec > 0 and icms_dec < 1.0:
        preco_sem_ipi = preco_sem_ipi / (1 - icms_dec)
    
    preco_sem_ipi = round(preco_sem_ipi, 2)
    
    # IPI é aplicado por fora (não entra no divisor)
    valor_ipi = round(preco_sem_ipi * ipi_dec, 2) if ipi_dec > 0 else 0
    preco_com_ipi = round(preco_sem_ipi + valor_ipi, 2)
    
    # Calcular cada componente em reais (para exibição)
    valor_margem = round(preco_sem_ipi * margem_dec, 2)
    valor_impostos_sem_icms = round(preco_sem_ipi * impostos_sem_icms_dec, 2)
    valor_icms = round(preco_sem_ipi * icms_dec, 2)
    valor_comissao = round(preco_sem_ipi * comissao_dec_aplicada, 2)
    
    return {
        'preco_final_produto_sem_ipi': preco_sem_ipi,
        'preco_final_produto_com_ipi': preco_com_ipi,
        'valor_ipi': valor_ipi,
        'valor_margem': valor_margem,
        'valor_impostos_sem_icms': valor_impostos_sem_icms,
        'valor_icms': valor_icms,
        'valor_comissao': valor_comissao,
        'base_icms': preco_sem_ipi,
        'base_impostos_nao_icms': preco_sem_ipi,
    }


def calcular_aproveitamento(
    altura_produto: Optional[float],
    altura_cm_db: Optional[float],
    fundo_cm: Optional[float],
    tamanho_alca: Optional[float],
    incluir_alca: bool,
    largura_used: float,
    largura_cm: float,
    lateral_effective: float,
    quantidade: int
) -> Dict[str, Any]:
    """
    Calcula aproveitamento da bobina (unidades por bobina, sobra, etc).
    
    Returns:
        Dicionário com informações de aproveitamento
    """
    resultado = {
        'aproveitamento_percentual': None,
        'unidades_por_bobina': None,
        'aproveitamento_detalhe': None,
        'altura_unit_effective_value': None,
        'utilizada_por_bobina_value': None,
        'sobra_por_bobina': None,
        'bobinas_necessarias': None,
        'total_altura_needed': None,
        'total_bobinas': None,
        'sobra_total': None,
    }
    
    if not altura_produto or not altura_cm_db:
        return resultado
    
    try:
        if altura_cm_db <= 0 or altura_produto <= 0:
            return resultado
        
        # Altura efetiva: frente (produto) + verso (produto) + fundo + alça
        altura_effective = (altura_produto * 2.0) + (fundo_cm or 0)
        if incluir_alca:
            altura_effective += float(tamanho_alca or 0)
        
        unidades_por_bobina = int(altura_cm_db // altura_effective)
        if unidades_por_bobina <= 0:
            return resultado
        
        utilizada_por_bobina = unidades_por_bobina * altura_effective
        aproveitamento_percentual = round((utilizada_por_bobina / altura_cm_db) * 100.0, 2)
        
        resultado.update({
            'altura_unit_effective_value': altura_effective,
            'unidades_por_bobina': unidades_por_bobina,
            'aproveitamento_percentual': aproveitamento_percentual,
            'aproveitamento_detalhe': {
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
            },
            'utilizada_por_bobina_value': utilizada_por_bobina,
            'sobra_por_bobina': max(0, altura_cm_db - utilizada_por_bobina),
        })
        
        # Totais
        if unidades_por_bobina > 0:
            resultado['bobinas_necessarias'] = math.ceil(quantidade / unidades_por_bobina)
        
        total_altura_needed = quantidade * altura_effective
        resultado['total_altura_needed'] = total_altura_needed
        
        if altura_cm_db > 0:
            total_bobinas = math.ceil(total_altura_needed / altura_cm_db)
            resultado['total_bobinas'] = total_bobinas
            resultado['sobra_total'] = (total_bobinas * altura_cm_db) - total_altura_needed
    
    except Exception:
        pass
    
    return resultado


def processar_impostos_detalhe(
    impostos_fixos_lista: List[Dict],
    base_impostos_nao_icms: float,
    icms: float,
    valor_icms: float,
    cliente_tem_ie: bool
) -> List[Dict]:
    """
    Monta detalhe de cada imposto com seus valores em R$.
    
    Returns:
        Lista de impostos com percentual e valor
    """
    impostos_detalhe = []
    
    for imp in impostos_fixos_lista:
        pct = float(imp.get('percentual') or 0)
        valor_imp = round(base_impostos_nao_icms * (pct / 100), 2)
        impostos_detalhe.append({
            'nome': imp.get('nome'),
            'percentual': pct,
            'valor': valor_imp,
            'base': 'preco_sem_ipi'
        })
    
    impostos_detalhe.append({
        'nome': 'ICMS',
        'percentual': icms,
        'valor': valor_icms,
        'base': 'preco_com_ipi' if not cliente_tem_ie else 'preco_sem_ipi',
        'origem': 'cliente_com_ie' if cliente_tem_ie else 'cliente_sem_ie'
    })
    
    return impostos_detalhe
