"""
api/ml_model.py — Motor de IA da AMÉLIA
=========================================

Carrega o modelo Random Forest pré-treinado e expõe predict_risk().

Para retreinar:
    python train_model.py

Protocolo de Manchester:
    🔴 red    → Emergência imediata
    🟠 orange → Muito urgente (≤ 10 min)
    🟡 yellow → Urgente (≤ 30 min)
    🟢 green  → Pouco urgente (≤ 2 h)
"""

import os
import joblib
import numpy as np
from pydantic import BaseModel, Field
from typing import Optional

# ─────────────────────────────────────────────────────────────
# CAMINHOS
# ─────────────────────────────────────────────────────────────

_ROOT        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH   = os.path.join(_ROOT, "modelo_amelia.joblib")
ENCODER_PATH = os.path.join(_ROOT, "encoder_amelia.joblib")

# Deve ser IDÊNTICA à lista em train_model.py
FEATURES = [
    "pain_level",
    "fever",
    "shortness_of_breath",
    "chest_pain",
    "altered_consciousness",
    "bleeding",
    "duration_hours",
    "age",
]

# Prefixos das senhas por cor
_PASSWORD_PREFIX = {"red": "VM", "orange": "LJ", "yellow": "AM", "green": "VD"}

# Contadores em memória (suficiente para demo; em prod use Redis)
_counters: dict[str, int] = {"red": 0, "orange": 0, "yellow": 0, "green": 0}

# Cache do modelo (carrega 1 vez, reutiliza em todas as requests)
_model   = None
_encoder = None


# ─────────────────────────────────────────────────────────────
# SCHEMA DE ENTRADA (VALIDADO PELO FASTAPI)
# ─────────────────────────────────────────────────────────────

class SymptomsInput(BaseModel):
    """Dados do paciente recebidos do frontend após o chat/voz."""

    # Identificação (CPF nunca é salvo — apenas hasheado)
    cpf: str = Field(..., description="CPF do paciente")
    age: int = Field(..., ge=0, le=120, description="Idade em anos")
    sex: str = Field("M", pattern="^[MF]$")

    # Sintomas coletados pelo chatbot
    description:           str  = Field(..., max_length=3000)
    pain_level:            int  = Field(..., ge=1, le=10)
    fever:                 bool = Field(False)
    shortness_of_breath:   bool = Field(False)
    chest_pain:            bool = Field(False)
    altered_consciousness: bool = Field(False)
    bleeding:              bool = Field(False)
    duration_hours:        int  = Field(24, ge=1)

    # Sinais vitais opcionais
    temperature:        Optional[float] = None
    heart_rate:         Optional[int]   = None
    oxygen_saturation:  Optional[float] = None


# ─────────────────────────────────────────────────────────────
# CARREGAMENTO COM CACHE
# ─────────────────────────────────────────────────────────────

def _load():
    global _model, _encoder
    if _model is not None:
        return _model, _encoder

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Modelo não encontrado: {MODEL_PATH}\n"
            "Rode: python train_model.py"
        )
    if not os.path.exists(ENCODER_PATH):
        raise FileNotFoundError(
            f"Encoder não encontrado: {ENCODER_PATH}\n"
            "Rode: python train_model.py"
        )

    _model   = joblib.load(MODEL_PATH)
    _encoder = joblib.load(ENCODER_PATH)
    print("✅ Modelo carregado com sucesso.")
    return _model, _encoder


# ─────────────────────────────────────────────────────────────
# GERAÇÃO DE SENHA
# ─────────────────────────────────────────────────────────────

def _make_password(color: str) -> str:
    _counters[color] += 1
    return f"{_PASSWORD_PREFIX[color]}{str(_counters[color]).zfill(3)}"


# ─────────────────────────────────────────────────────────────
# PREDIÇÃO
# ─────────────────────────────────────────────────────────────

def predict_risk(data: SymptomsInput) -> dict:
    """
    Classifica a urgência do paciente com o modelo Random Forest.

    Retorna dict completo com cor, prioridade, senha e confiança.
    """
    model, encoder = _load()

    X = np.array([[
        data.pain_level,
        int(data.fever),
        int(data.shortness_of_breath),
        int(data.chest_pain),
        int(data.altered_consciousness),
        int(data.bleeding),
        data.duration_hours,
        data.age,
    ]], dtype=float)

    idx   = model.predict(X)[0]
    proba = model.predict_proba(X)[0]
    color = encoder.inverse_transform([idx])[0]
    conf  = round(float(proba[idx]), 4)

    meta = {
        "red":    (1, "Imediato",  "🔴 Emergência — Atendimento imediato!"),
        "orange": (2, "≤ 10 min",  "🟠 Muito Urgente — Será atendido em breve."),
        "yellow": (3, "≤ 30 min",  "🟡 Urgente — Aguarde na fila prioritária."),
        "green":  (4, "≤ 2 horas", "🟢 Pouco Urgente — Aguarde na fila regular."),
    }
    priority, wait, explanation = meta[color]

    return {
        "color":        color,
        "priority":     priority,
        "wait_time":    wait,
        "explanation":  explanation,
        "confidence":   conf,
        "password":     _make_password(color),
    }
