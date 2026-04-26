"""
train_model.py — Script de Treinamento do Modelo A.M.E.L.I.A
=============================================================

Execute UMA VEZ para gerar os arquivos do modelo:
    python train_model.py

Saída:
    modelo_amelia.joblib   → modelo Random Forest treinado
    encoder_amelia.joblib  → codificador de classes string↔número

Protocolo de Manchester (4 níveis):
    🔴 red    → Emergência (imediato)
    🟠 orange → Muito urgente (≤ 10 min)
    🟡 yellow → Urgente (≤ 30 min)
    🟢 green  → Pouco urgente (≤ 2 h)

Features usadas pelo modelo:
    pain_level             Escala 1-10 de dor subjetiva
    fever                  Febre presente (0/1)
    shortness_of_breath    Falta de ar (0/1)
    chest_pain             Dor no peito (0/1)
    altered_consciousness  Consciência alterada/convulsão (0/1)
    bleeding               Sangramento ativo (0/1)
    duration_hours         Duração dos sintomas em horas
    age                    Idade do paciente em anos
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder

# ─────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────

DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset_treino.csv")
MODEL_PATH   = os.path.join(os.path.dirname(__file__), "modelo_amelia.joblib")
ENCODER_PATH = os.path.join(os.path.dirname(__file__), "encoder_amelia.joblib")

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

# ─────────────────────────────────────────────────────────────
# GERAÇÃO DE DADOS SINTÉTICOS
# ─────────────────────────────────────────────────────────────

def _classify_manchester(pain, fever, sob, chest, cons, bleed, dur, age):
    """
    Aplica as regras do Protocolo de Manchester para gerar o rótulo.
    Esta função é a "verdade" usada para treinar o modelo.
    """
    # Critérios de EMERGÊNCIA (vermelho)
    if (cons == 1                         # inconsciência/convulsão
        or (sob == 1 and chest == 1)      # falta de ar + dor no peito
        or pain >= 9                      # dor extrema
        or (bleed == 1 and pain >= 7)     # sangramento severo
        or (age < 3 and fever == 1)       # bebê com febre
        or (age > 80 and pain >= 7)):     # idoso muito idoso com dor forte
        return "red"

    # Critérios MUITO URGENTES (laranja)
    if (pain >= 7
        or sob == 1
        or chest == 1
        or (fever == 1 and age >= 65)    # idoso com febre
        or (fever == 1 and age <= 5)     # criança pequena com febre
        or bleed == 1
        or (pain >= 6 and dur <= 2)):    # dor moderada com início súbito
        return "orange"

    # Critérios URGENTES (amarelo)
    if (pain >= 4
        or (fever == 1 and pain >= 3)
        or dur <= 8):                    # sintoma recente (< 8 h)
        return "yellow"

    # Pouco urgente (verde)
    return "green"


def generate_synthetic_data(n=800, seed=42):
    """
    Gera amostras sintéticas cobrindo amplamente o espaço de features.
    Parâmetros escolhidos para equilibrar as classes.
    """
    np.random.seed(seed)
    rows = []

    # Estratégia: gera 4 × 200 amostras por classe para balancear
    targets = {"red": 0, "orange": 0, "yellow": 0, "green": 0}
    max_per_class = n // 4
    attempts = 0

    while sum(targets.values()) < n and attempts < n * 20:
        attempts += 1
        pain  = np.random.randint(1, 11)
        fever = np.random.randint(0, 2)
        sob   = np.random.randint(0, 2)
        chest = np.random.randint(0, 2)
        cons  = np.random.randint(0, 2)
        bleed = np.random.randint(0, 2)
        dur   = np.random.choice([1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 120, 168])
        age   = np.random.randint(1, 95)

        color = _classify_manchester(pain, fever, sob, chest, cons, bleed, dur, age)

        if targets[color] < max_per_class:
            targets[color] += 1
            rows.append([pain, fever, sob, chest, cons, bleed, dur, age, color])

    return pd.DataFrame(rows, columns=FEATURES + ["risk_color"])


# ─────────────────────────────────────────────────────────────
# PIPELINE DE TREINAMENTO
# ─────────────────────────────────────────────────────────────

def train_and_save():
    print("=" * 60)
    print("  A.M.E.L.I.A — Treinamento do Modelo de Triagem v2.0")
    print("=" * 60)

    # ── 1. Carregar dados ────────────────────────────────────
    df_manual = pd.read_csv(DATASET_PATH)
    print(f"\n📂 Dataset manual carregado: {len(df_manual)} amostras")

    df_synth = generate_synthetic_data(n=800)
    print(f"🔬 Dados sintéticos gerados: {len(df_synth)} amostras")

    df = pd.concat([df_manual, df_synth], ignore_index=True)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    print(f"📊 Total combinado: {len(df)} amostras\n")

    # Distribuição
    print("Distribuição das classes:")
    dist = df["risk_color"].value_counts()
    emojis = {"red": "🔴", "orange": "🟠", "yellow": "🟡", "green": "🟢"}
    for c, n in dist.items():
        bar = "█" * (n // 8)
        print(f"  {emojis.get(c,'')} {c:<8} {bar} {n}")

    # ── 2. Preparar X e y ───────────────────────────────────
    X = df[FEATURES].values.astype(float)
    encoder = LabelEncoder()
    y = encoder.fit_transform(df["risk_color"].values)
    print(f"\nClasses: {list(encoder.classes_)}")

    # ── 3. Split estratificado ───────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"\nTreino: {len(X_train)} | Teste: {len(X_test)}\n")

    # ── 4. Modelo Random Forest (otimizado) ─────────────────
    # n_estimators=200: mais árvores → maior estabilidade
    # max_depth=12: profundidade suficiente para regras Manchester
    # min_samples_split=4: evita overfitting
    # class_weight="balanced": compensa desbalanceamento
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    print("🌲 Treinando Random Forest (200 árvores)...")
    model.fit(X_train, y_train)

    # ── 5. Avaliação ─────────────────────────────────────────
    y_pred = model.predict(X_test)
    y_test_lbl = encoder.inverse_transform(y_test)
    y_pred_lbl = encoder.inverse_transform(y_pred)

    print("\n📊 Relatório de Classificação:")
    print("-" * 50)
    print(classification_report(y_test_lbl, y_pred_lbl))

    # Validação cruzada 10-fold
    skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=skf, scoring="accuracy")
    print("🎯 Validação Cruzada 10-fold:")
    print(f"   Acurácia média: {cv_scores.mean():.4f} ({cv_scores.mean()*100:.2f}%)")
    print(f"   Desvio padrão:  {cv_scores.std():.4f}")
    print(f"   Mínima:         {cv_scores.min():.4f}")
    print(f"   Máxima:         {cv_scores.max():.4f}")

    # ── 6. Feature importance ────────────────────────────────
    print("\n🔍 Importância das Variáveis (para defesa do projeto):")
    print("-" * 50)
    importances = sorted(
        zip(FEATURES, model.feature_importances_),
        key=lambda x: x[1], reverse=True
    )
    for feat, imp in importances:
        bar = "█" * int(imp * 60)
        print(f"  {feat:<28} {bar} {imp:.4f}")

    # ── 7. Matriz de confusão ────────────────────────────────
    print("\n📉 Matriz de Confusão:")
    classes = list(encoder.classes_)
    cm = confusion_matrix(y_test, y_pred)
    header = "        " + "  ".join(f"{c[:3]:>5}" for c in classes)
    print(header)
    for i, row in enumerate(cm):
        label = classes[i][:5].ljust(7)
        nums  = "  ".join(f"{v:>5}" for v in row)
        print(f"  {label}  {nums}")

    # ── 8. Salvar ────────────────────────────────────────────
    joblib.dump(model,   MODEL_PATH,   compress=3)
    joblib.dump(encoder, ENCODER_PATH, compress=3)
    print(f"\n💾 modelo_amelia.joblib  → {MODEL_PATH}")
    print(f"💾 encoder_amelia.joblib → {ENCODER_PATH}")

    final_acc = cv_scores.mean() * 100
    status = "✅ META ATINGIDA" if final_acc >= 96 else "⚠️  abaixo de 96%"
    print(f"\n{status} — Acurácia CV: {final_acc:.2f}%")
    print("=" * 60)
    print("  Agora rode: uvicorn api.index:app --reload --port 8000")
    print("=" * 60)

    return model, encoder


if __name__ == "__main__":
    train_and_save()
