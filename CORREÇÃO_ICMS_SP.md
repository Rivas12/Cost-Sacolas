# Correção: Cálculo de ICMS para Cliente com IE em SP

## Problema Identificado
Clientes de SP COM Inscrição Estadual (IE) estavam sendo cobrados com ICMS muito alto (18% completo) quando o correto é usar apenas 12% (alíquota interestadual).

## Root Cause
No arquivo `Backend/app/routes/api_routes.py` linhas ~1085-1105, havia uma lógica especial **incorreta** que tratava clientes COM IE do mesmo estado (SP → SP) de forma diferente:

```python
# ❌ INCORRETO (código antigo)
if cliente_tem_ie:
    if estado and estado == ESTADO_EMPRESA:
        icms = float(ICMS_CONSUMIDOR_FINAL.get(estado, 0.0))  # Usava 18% completo!
        icms_origem = 'icms_completo_mesmo_estado'
    else:
        icms = get_icms_interestadual(ESTADO_EMPRESA, estado)  # Usava 12% para outro estado
```

## Regra Fiscal Correta
- **Cliente COM IE**: SEMPRE usa ICMS interestadual (7% ou 12%), independente do estado
  - SP → SP: 12% (Sul/Sudeste → Sul/Sudeste)
  - SP → BA: 7% (Sul/Sudeste → Norte/Nordeste)
- **Cliente SEM IE**: Usa ICMS completo do estado (18% em SP)

## Solução Aplicada
Corrigido em `Backend/app/routes/api_routes.py`:

```python
# ✅ CORRETO (código novo)
if cliente_tem_ie:
    # Cliente COM IE: SEMPRE usa alíquota interestadual (7% ou 12%)
    icms = get_icms_interestadual(ESTADO_EMPRESA, estado) if estado else 0.0
    icms_origem = 'icms_interestadual_ie' if estado else 'icms_zero_sem_estado'
else:
    # Cliente SEM IE: usa alíquota completa do estado
    icms = float(ICMS_CONSUMIDOR_FINAL.get(estado, 0.0)) if estado else 0.0
```

## Impacto
### Antes (com erro):
- Cliente SP com IE: **18% ICMS** ❌ ERRADO
- Preço final: **MUITO CARO**

### Depois (corrigido):
- Cliente SP com IE: **12% ICMS** ✅ CORRETO
- Preço final: **Redução significativa** (aproximadamente 5-6% mais barato)

## Nota
A função em `Backend/app/utils/price_calculator.py` já estava com a lógica correta desde o início, então não foi necessário alterar.

## Status
✅ Correção aplicada em `Backend/app/routes/api_routes.py`
