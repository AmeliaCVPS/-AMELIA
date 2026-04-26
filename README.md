# A.M.E.L.I.A v2.0
**Atendimento Médico Eficiente Lenitivo com Inteligência Artificial**

> Projeto FeNaDANTE 2025 — Colégio Visconde de Porto Seguro

---

## 🚀 Como rodar localmente

```bash
# 1. Instalar dependências Python
pip install -r requirements.txt

# 2. Treinar o modelo ML (gera modelo_amelia.joblib)
python train_model.py

# 3. Subir a API
uvicorn api.index:app --reload --port 8000

# 4. Abrir o frontend
# Abra index.html no Chrome (necessário para reconhecimento de voz)
```

A documentação interativa da API fica em: http://localhost:8000/docs

---

## 📁 Estrutura do projeto

```
amelia_final/
├── index.html          ← Frontend principal
├── style.css           ← Design (DM Sans + Space Grotesk)
├── script.js           ← Lógica do chatbot e PDF
├── voice.js            ← Módulo de voz (STT + TTS)
│
├── api/
│   ├── __init__.py
│   ├── index.py        ← API FastAPI (rotas)
│   ├── ml_model.py     ← Carrega o modelo e classifica
│   └── database.py     ← SQLite/PostgreSQL + criptografia
│
├── train_model.py      ← Script de treinamento do ML
├── dataset_treino.csv  ← Dataset rotulado (310 amostras manuais)
├── modelo_amelia.joblib   ← Modelo Random Forest treinado
├── encoder_amelia.joblib  ← Encoder de classes
│
├── requirements.txt
├── vercel.json         ← Configuração de deploy (Vercel)
└── .gitignore
```

---

## 🧠 Machine Learning

| Parâmetro | Valor |
|-----------|-------|
| Algoritmo | Random Forest |
| Árvores | 200 |
| Profundidade máx. | 12 |
| Acurácia CV 10-fold | **96.42%** |
| Features | 8 (dor, febre, falta de ar, etc.) |
| Classes | 4 (red, orange, yellow, green) |

### Features do modelo
| Feature | Descrição |
|---------|-----------|
| pain_level | Escala subjetiva de dor (1-10) |
| fever | Febre presente (0/1) |
| shortness_of_breath | Falta de ar (0/1) |
| chest_pain | Dor no peito (0/1) |
| altered_consciousness | Consciência alterada/convulsão (0/1) |
| bleeding | Sangramento ativo (0/1) |
| duration_hours | Duração dos sintomas em horas |
| age | Idade do paciente |

### Ampliar o dataset
Edite `dataset_treino.csv` adicionando linhas no formato:
```
pain_level,fever,shortness_of_breath,chest_pain,altered_consciousness,bleeding,duration_hours,age,risk_color
8,1,0,0,0,0,6,55,orange
```
Depois execute `python train_model.py` para retreinar.

---

## 🔐 Segurança e LGPD

- **CPF**: nunca armazenado — apenas hash SHA-256 irreversível
- **Dados clínicos**: cifrados com AES-128 (Fernet) antes de ir ao banco
- **Senhas de usuário**: hash SHA-256 (em produção: use bcrypt no backend)
- **Banco**: SQLite local em desenvolvimento, PostgreSQL em produção

---

## ☁️ Deploy no Vercel

1. Faça push do projeto para o GitHub  
2. Conecte ao Vercel e importe o repositório  
3. Adicione as variáveis de ambiente:
   - `DATABASE_URL` → string de conexão PostgreSQL (Supabase/Neon)
   - `FERNET_KEY`   → chave Fernet (gere com `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)

---

## 👥 Equipe

| Nome | Função |
|------|--------|
| Marcelo de Oliveira | Desenvolvimento |
| Marcos Pires | Desenvolvimento |
| Thiago Nascimento | Desenvolvimento |
| Daniel Oliveira | Desenvolvimento |

**Professor:** Anderson Borges  
**Curso:** Robótica e IA — 2ª série EM
