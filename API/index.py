"""
api/index.py — API Principal da AMÉLIA v2.0
============================================

Rotas:
  GET  /api/health                → Status
  POST /api/classify              → Triagem via JSON estruturado
  POST /api/classify/from-text    → Triagem via texto livre (voz)
  GET  /api/prontuario/{id}       → Consulta prontuário (requer auth em prod)

Rodar localmente:
  uvicorn api.index:app --reload --port 8000

Documentação interativa (Swagger):
  http://localhost:8000/docs
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import init_db, save_prontuario, load_prontuario
from .ml_model  import predict_risk, SymptomsInput

# ─────────────────────────────────────────────────────────────
# APLICAÇÃO
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="A.M.E.L.I.A — API de Triagem Médica",
    description=(
        "Sistema inteligente baseado no Protocolo de Manchester. "
        "Modelo Random Forest com 96.4% de acurácia (CV 10-fold)."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Em produção: defina o domínio exato
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def _startup():
    init_db()
    print("🚀 A.M.E.L.I.A API v2.0 iniciada!")


# ─────────────────────────────────────────────────────────────
# SCHEMA PARA TEXTO LIVRE (VOZ)
# ─────────────────────────────────────────────────────────────

class TextTriageInput(BaseModel):
    cpf:         str          = Field(...)
    age:         int          = Field(..., ge=0, le=120)
    sex:         str          = Field("M", pattern="^[MF]$")
    text:        str          = Field(..., max_length=4000)
    temperature: Optional[float] = None


# ─────────────────────────────────────────────────────────────
# EXTRAÇÃO DE SINTOMAS DO TEXTO
# ─────────────────────────────────────────────────────────────

def _extract(text: str, cpf: str, age: int, sex: str,
             temperature: Optional[float] = None) -> SymptomsInput:
    """
    Análise léxica do relato do paciente.
    Extrai features estruturadas para o modelo ML.

    Em produção com orçamento extra: substitua por chamada à API
    Claude para extração muito mais robusta via LLM.
    """
    t = text.lower()

    # ── Nível de dor ────────────────────────────────────────
    pain = 5
    nums = re.findall(r'\b(10|[1-9])\b', t)
    if nums:
        pain = int(nums[0])
    elif any(w in t for w in ["insuportável","horrível","terrível","agonia","pior"]):
        pain = 10
    elif any(w in t for w in ["muito forte","intensa","severa","aguda"]):
        pain = 8
    elif any(w in t for w in ["forte","considerável"]):
        pain = 7
    elif any(w in t for w in ["moderada","média","razoável"]):
        pain = 5
    elif any(w in t for w in ["leve","fraca","pequena","pouca"]):
        pain = 3
    elif any(w in t for w in ["mínima","quase nada"]):
        pain = 1

    # ── Febre ────────────────────────────────────────────────
    fever = any(w in t for w in [
        "febre","febril","temperatura alta","quente demais",
        "38","39","40","37.5","37,5",
    ])

    # ── Falta de ar ──────────────────────────────────────────
    sob = any(w in t for w in [
        "falta de ar","sem ar","dificuldade para respirar",
        "não consigo respirar","ofego","sufocando","sufocação",
        "respiração difícil","cansaço ao respirar","dispneia",
    ])

    # ── Dor no peito ─────────────────────────────────────────
    chest = any(w in t for w in [
        "dor no peito","aperto no peito","pressão no peito",
        "dor torácica","coração doendo","infarto","angina",
        "dor irradiando","irradiação para o braço",
    ])

    # ── Consciência alterada ─────────────────────────────────
    cons = any(w in t for w in [
        "desmaiei","perdi a consciência","apagou","convulsão",
        "convulsionando","desorientado","confuso","não responde",
        "tonteira intensa","não consigo ficar de pé","síncope",
    ])

    # ── Sangramento ──────────────────────────────────────────
    bleed = any(w in t for w in [
        "sangue","sangrando","sangramento","hemorragia",
        "vomitei sangue","fezes negras","melena","hematêmese",
        "urina com sangue","epistaxe intensa",
    ])

    # ── Duração ──────────────────────────────────────────────
    dur = 24
    if m := re.search(r'(\d+)\s*semana', t):
        dur = int(m.group(1)) * 168
    elif m := re.search(r'(\d+)\s*dia', t):
        dur = int(m.group(1)) * 24
    elif m := re.search(r'(\d+)\s*hora', t):
        dur = max(1, int(m.group(1)))
    elif m := re.search(r'(\d+)\s*minuto', t):
        dur = max(1, int(m.group(1)) // 60)
    elif any(w in t for w in ["agora","agora pouco","acabou de","há pouco"]):
        dur = 1
    elif any(w in t for w in ["hoje cedo","esta manhã","esta tarde"]):
        dur = 4
    elif any(w in t for w in ["ontem","desde ontem"]):
        dur = 24
    elif any(w in t for w in ["há dias","vários dias","alguns dias"]):
        dur = 72

    return SymptomsInput(
        cpf=cpf, age=age, sex=sex, description=text,
        pain_level=pain,
        fever=fever,
        shortness_of_breath=sob,
        chest_pain=chest,
        altered_consciousness=cons,
        bleeding=bleed,
        duration_hours=dur,
        temperature=temperature,
    )


# ─────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────

def _build_prontuario(data: SymptomsInput, classification: dict) -> dict:
    return {
        "id":        str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "patient": {"age": data.age, "sex": data.sex},
        "symptoms": {
            "description":           data.description,
            "pain_level":            data.pain_level,
            "fever":                 data.fever,
            "shortness_of_breath":   data.shortness_of_breath,
            "chest_pain":            data.chest_pain,
            "altered_consciousness": data.altered_consciousness,
            "bleeding":              data.bleeding,
            "duration_hours":        data.duration_hours,
        },
        "vital_signs": {
            "temperature":       data.temperature,
            "heart_rate":        data.heart_rate,
            "oxygen_saturation": data.oxygen_saturation,
        },
        "classification": classification,
    }


# ─────────────────────────────────────────────────────────────
# ROTAS
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "online", "system": "A.M.E.L.I.A", "version": "2.0.0"}


@app.post("/api/classify")
async def classify(data: SymptomsInput):
    """Triagem completa a partir de dados estruturados."""
    try:
        cls   = predict_risk(data)
        pron  = _build_prontuario(data, cls)
        save_prontuario(pron, data.cpf)
        return {
            "prontuario_id": pron["id"],
            "password":      cls["password"],
            "classification": {
                "color":       cls["color"],
                "priority":    cls["priority"],
                "wait_time":   cls["wait_time"],
                "explanation": cls["explanation"],
                "confidence":  cls["confidence"],
            },
            "message": f"Triagem concluída. {cls['explanation']} Senha: {cls['password']}.",
        }
    except FileNotFoundError as e:
        raise HTTPException(503, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/api/classify/from-text")
async def classify_from_text(data: TextTriageInput):
    """Triagem a partir de texto livre (relato por voz)."""
    try:
        symp = _extract(data.text, data.cpf, data.age, data.sex, data.temperature)
        return await classify(symp)
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.get("/api/prontuario/{prontuario_id}")
async def get_prontuario(prontuario_id: str):
    """Consulta prontuário descriptografado pelo UUID."""
    p = load_prontuario(prontuario_id)
    if not p:
        raise HTTPException(404, detail="Prontuário não encontrado.")
    return p
