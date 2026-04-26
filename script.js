/* ═══════════════════════════════════════════════════════════
   script.js — Lógica principal da AMÉLIA
   ═══════════════════════════════════════════════════════════ */

// ── Estado global ─────────────────────────────────────────
let currentUser = null;
let chatData = {
    currentStep:    0,
    answers:        {},
    classification: null,
    password:       null,
    apiResult:      null,
};

// ── Perguntas do chatbot ──────────────────────────────────
// As IDs batem com as features do modelo ML
const QUESTIONS = [
    {
        id:   "greeting",
        text: "Olá! Sou a AMÉLIA 🤖 — sua assistente de triagem. Como você está se sentindo hoje?",
    },
    {
        id:   "pain_level",
        text: "Numa escala de 0 a 10, qual o nível da sua dor ou desconforto? (0 = nenhuma, 10 = insuportável)",
    },
    {
        id:   "symptoms",
        text: "Você sente febre, falta de ar, dor no peito ou qualquer outro sintoma grave? Descreva com detalhes.",
    },
    {
        id:   "duration",
        text: "Há quanto tempo esses sintomas começaram? (Ex: 2 horas, 3 dias, 1 semana)",
    },
    {
        id:   "additional",
        text: "Por último: há algum histórico médico, medicamento em uso ou alergia que deva saber?",
    },
];

// ── Inicialização ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("ameliaUser");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            _updateHeader();
        } catch { localStorage.removeItem("ameliaUser"); }
    }
    _initMasks();
    _fixLogo();
});

// ── Navegação ─────────────────────────────────────────────
function showScreen(name) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add("active");

    if (name === "painel" && currentUser) {
        checkAPIStatus();   // voice.js
        initChat();
    }
}

function _updateHeader() {
    const nav   = document.getElementById("nav-buttons");
    if (!nav) return;
    const nome  = currentUser.nome.split(" ")[0];
    nav.innerHTML = `
        <span style="font-weight:600;color:var(--c-blue)">Olá, ${nome}</span>
        <button class="btn btn-ghost" onclick="showScreen('painel')">Triagem</button>
        <button class="btn btn-ghost" onclick="showScreen('sobre')">Sobre</button>
        <button class="btn btn-ghost" onclick="_logout()">Sair</button>
    `;
}

function _logout() {
    currentUser = null;
    localStorage.removeItem("ameliaUser");
    location.reload();
}

// ── Máscaras ──────────────────────────────────────────────
function _initMasks() {
    // CPF
    document.querySelectorAll("#cad-cpf, #login-id").forEach(el => {
        el.addEventListener("input", e => {
            let v = e.target.value.replace(/\D/g, "").slice(0, 11);
            v = v.replace(/(\d{3})(\d)/, "$1.$2")
                 .replace(/(\d{3})(\d)/, "$1.$2")
                 .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
            e.target.value = v;
        });
    });

    // SUS
    const sus = document.getElementById("cad-sus");
    if (sus) sus.addEventListener("input", e => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 15);
        v = v.replace(/(\d{3})(\d)/, "$1 $2")
             .replace(/(\d{4})(\d)/, "$1 $2")
             .replace(/(\d{4})(\d)/, "$1 $2");
        e.target.value = v;
    });

    // Tel
    const tel = document.getElementById("cad-telefone");
    if (tel) tel.addEventListener("input", e => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 11);
        v = v.replace(/(\d{2})(\d)/, "($1) $2")
             .replace(/(\d{5})(\d)/, "$1-$2");
        e.target.value = v;
    });
}

// ── Validações ────────────────────────────────────────────
function _validateCPF(cpf) {
    cpf = cpf.replace(/\D/g, "");
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += +cpf[i] * (10 - i);
    let d1 = 11 - (s % 11); if (d1 > 9) d1 = 0;
    s = 0;
    for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i);
    let d2 = 11 - (s % 11); if (d2 > 9) d2 = 0;
    return +cpf[9] === d1 && +cpf[10] === d2;
}
function _validateSUS(sus) {
    return /^\d{15}$/.test(sus.replace(/\D/g, ""));
}

// ── SHA-256 (hash da senha — só no frontend demo) ─────────
async function _hash(pwd) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pwd));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Cadastro ─────────────────────────────────────────────
async function handleCadastro(e) {
    e.preventDefault();
    const nome    = document.getElementById("cad-nome").value.trim();
    const cpf     = document.getElementById("cad-cpf").value;
    const sus     = document.getElementById("cad-sus").value;
    const nasc    = document.getElementById("cad-nascimento").value;
    const sexo    = document.getElementById("cad-sexo").value;
    const tel     = document.getElementById("cad-telefone").value;
    const senha   = document.getElementById("cad-senha").value;
    const confirm = document.getElementById("cad-senha-confirm").value;

    if (!_validateCPF(cpf))    { showToast("CPF inválido.", "error"); return; }
    if (!_validateSUS(sus))    { showToast("Cartão SUS inválido (15 dígitos).", "error"); return; }
    if (senha !== confirm)     { showToast("As senhas não coincidem.", "error"); return; }
    if (!sexo)                 { showToast("Selecione o sexo biológico.", "error"); return; }

    const users = JSON.parse(localStorage.getItem("ameliaUsers") || "[]");
    const cpfC  = cpf.replace(/\D/g, "");
    const susC  = sus.replace(/\D/g, "");

    if (users.find(u => u.cpf === cpfC || u.sus === susC)) {
        showToast("CPF ou SUS já cadastrado.", "error"); return;
    }

    const h = await _hash(senha);
    users.push({ nome, cpf: cpfC, sus: susC, nascimento: nasc, sexo, telefone: tel, h });
    localStorage.setItem("ameliaUsers", JSON.stringify(users));

    showToast("Conta criada! Faça login.", "success");
    document.getElementById("form-cadastro").reset();
    setTimeout(() => showScreen("login"), 1400);
}

// ── Login ─────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const id    = document.getElementById("login-id").value.replace(/\D/g, "");
    const senha = document.getElementById("login-senha").value;
    const users = JSON.parse(localStorage.getItem("ameliaUsers") || "[]");
    const hpwd  = await _hash(senha);
    const user  = users.find(u => (u.cpf === id || u.sus === id) && u.h === hpwd);

    if (user) {
        currentUser = user;
        localStorage.setItem("ameliaUser", JSON.stringify(user));
        showToast("Bem-vindo(a), " + user.nome.split(" ")[0] + "!", "success");
        _updateHeader();
        setTimeout(() => showScreen("painel"), 900);
    } else {
        showToast("CPF/SUS ou senha incorretos.", "error");
    }
}

// ── Chat ──────────────────────────────────────────────────
function initChat() {
    chatData = { currentStep: 0, answers: {}, classification: null, password: null, apiResult: null };

    document.getElementById("chat-messages").innerHTML = "";
    document.getElementById("chat-input-area").style.display = "flex";
    document.getElementById("chat-actions").style.display    = "none";

    const fb = document.getElementById("voice-feedback");
    if (fb) fb.textContent = "";

    setTimeout(() => {
        _botMsg(QUESTIONS[0].text);
        if (typeof speak === "function") speak(QUESTIONS[0].text);
        _enableInput();
    }, 400);
}

function _botMsg(html) {
    const box = document.getElementById("chat-messages");

    // typing indicator
    const t = document.createElement("div");
    t.className = "message message-bot";
    t.innerHTML = `<div class="av">🤖</div><div class="typing-indicator"><span></span><span></span><span></span></div>`;
    box.appendChild(t);
    _scrollBottom();

    setTimeout(() => {
        t.remove();
        const d = document.createElement("div");
        d.className = "message message-bot";
        d.innerHTML = `<div class="av">🤖</div><div class="message-content">${html}</div>`;
        box.appendChild(d);
        _scrollBottom();
    }, 850 + Math.random() * 350);
}

function addBotMessage(html) { _botMsg(html); }  // alias para voice.js

function addUserMessage(text) {
    const box = document.getElementById("chat-messages");
    const d   = document.createElement("div");
    d.className = "message message-user";
    d.innerHTML = `<div class="message-content">${_esc(text)}</div>`;
    box.appendChild(d);
    _scrollBottom();
}

function _enableInput() {
    const inp = document.getElementById("chat-input");
    const btn = document.getElementById("chat-send");
    inp.disabled = btn.disabled = false;
    inp.value    = "";
    inp.focus();
    inp.onkeypress = ev => { if (ev.key === "Enter") sendMessage(); };
}
function _disableInput() {
    document.getElementById("chat-input").disabled  = true;
    document.getElementById("chat-send").disabled   = true;
}

function sendMessage() {
    const inp = document.getElementById("chat-input");
    const msg = inp.value.trim();
    if (!msg) return;

    addUserMessage(msg);
    inp.value = "";
    _disableInput();

    chatData.answers[QUESTIONS[chatData.currentStep].id] = msg;
    chatData.currentStep++;

    const acks = [
        "Entendo. Obrigada por compartilhar.",
        "Sinto muito que esteja passando por isso.",
        "Agradeço pela confiança.",
        "Compreendo. Vamos continuar.",
    ];

    if (chatData.currentStep < QUESTIONS.length) {
        setTimeout(() => {
            _botMsg(acks[Math.floor(Math.random() * acks.length)]);
            setTimeout(() => {
                const next = QUESTIONS[chatData.currentStep].text;
                _botMsg(next);
                if (typeof speak === "function") speak(next);
                _enableInput();
            }, 1300);
        }, 600);
    } else {
        _finishChat();
    }
}

// ── Finalizar triagem ─────────────────────────────────────
function _finishChat() {
    setTimeout(() => {
        _botMsg("Obrigada! Analisando suas respostas…");
        setTimeout(async () => {
            const apiOnline = (typeof voiceState !== "undefined") && voiceState.apiOnline;
            if (apiOnline) {
                await _classifyViaAPI();
            } else {
                _classifyLocal();
            }
        }, 1600);
    }, 700);
}

async function _classifyViaAPI() {
    try {
        const text = Object.entries(chatData.answers)
            .filter(([k]) => k !== "greeting")
            .map(([, v]) => v)
            .join(". ");

        const age = currentUser ? _calcAge(currentUser.nascimento) : 30;
        const sex = currentUser?.sexo || "M";
        const cpf = currentUser?.cpf  || "00000000000";

        const res = await fetch(`${API_BASE_URL}/api/classify/from-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, cpf, age, sex }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);

        const result = await res.json();
        chatData.apiResult      = result;
        chatData.password       = result.password;
        chatData.classification = _colorToLetter(result.classification.color);
        _showResult(result.classification.color, result.classification.explanation,
                    result.password, result.classification.confidence);
    } catch (err) {
        console.warn("API falhou, usando classificação local:", err);
        _classifyLocal();
    }
}

function _classifyLocal() {
    const pain = parseInt(chatData.answers.pain_level) || 5;
    const sym  = (chatData.answers.symptoms || "").toLowerCase();

    let color;
    if (pain >= 9 || sym.includes("falta de ar") || sym.includes("dor no peito") ||
        sym.includes("desmaiei") || sym.includes("sangue") || sym.includes("convulsão")) {
        color = "red";
    } else if (pain >= 7 || sym.includes("febre") || sym.includes("respirar")) {
        color = "orange";
    } else if (pain >= 4 || sym.includes("febre")) {
        color = "yellow";
    } else {
        color = "green";
    }

    const exps = {
        red:    "🔴 Emergência — Atendimento imediato!",
        orange: "🟠 Muito Urgente — Você será atendido em breve.",
        yellow: "🟡 Urgente — Aguarde na fila prioritária.",
        green:  "🟢 Pouco Urgente — Aguarde na fila regular.",
    };

    chatData.classification = _colorToLetter(color);
    chatData.password       = _localPwd(color);
    _showResult(color, exps[color], chatData.password, null);
}

function _showResult(color, explanation, password, confidence) {
    const confLine = confidence != null
        ? `<br><small style="color:var(--c-muted)">Confiança da IA: ${(confidence*100).toFixed(1)}%</small>`
        : `<br><small style="color:var(--c-muted)">Classificação local (backend offline)</small>`;

    const prioClass = { red:"prio-red", orange:"prio-orange", yellow:"prio-yellow", green:"prio-green" }[color] || "prio-green";

    _botMsg(`
        <span class="prio-badge ${prioClass}">${explanation}</span><br><br>
        🎫 Sua senha de atendimento:<br>
        <span style="font-family:var(--font-display);font-size:2.1rem;font-weight:700;
                     color:var(--c-blue);letter-spacing:.08em;">${password}</span>
        ${confLine}<br><br>
        Baixe o prontuário PDF e apresente no guichê.
    `);

    if (typeof speak === "function") {
        speak(`Triagem concluída. ${explanation} Sua senha é ${password.split("").join(" ")}.`);
    }

    document.getElementById("chat-input-area").style.display = "none";
    document.getElementById("chat-actions").style.display    = "flex";
}

// ── Contadores locais de senha ─────────────────────────────
const _pwdCnt = { red: 0, orange: 0, yellow: 0, green: 0 };
function _localPwd(color) {
    const pfx = { red: "VM", orange: "LJ", yellow: "AM", green: "VD" };
    _pwdCnt[color]++;
    return `${pfx[color]}${String(_pwdCnt[color]).padStart(3, "0")}`;
}
function _colorToLetter(c) {
    return c === "red" || c === "orange" ? "U" : c === "yellow" ? "M" : "L";
}

// ── PDF ───────────────────────────────────────────────────
function generatePDF() {
    if (typeof window.jspdf === "undefined") {
        showToast("Recarregue a página para gerar o PDF.", "error"); return;
    }
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF();
    const now  = new Date();
    const date = now.toLocaleDateString("pt-BR");
    const time = now.toLocaleTimeString("pt-BR");

    const W = 210, M = 20;

    // Cabeçalho
    doc.setFillColor(26, 86, 219);
    doc.rect(0, 0, W, 38, "F");
    doc.setFontSize(22); doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.text("PRONTUÁRIO DE TRIAGEM", W / 2, 17, { align: "center" });
    doc.setFontSize(11); doc.setFont(undefined, "normal");
    doc.text("A.M.E.L.I.A — Sistema de Triagem por IA", W / 2, 28, { align: "center" });

    // Dados do paciente
    let y = 50;
    doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text("DADOS DO PACIENTE", M, y); y += 6;
    doc.setFontSize(11); doc.setTextColor(26, 32, 53);
    doc.setFont(undefined, "bold");
    doc.text(`Nome:`, M, y);
    doc.setFont(undefined, "normal");
    doc.text(`${currentUser?.nome || "—"}`, M + 22, y); y += 7;
    doc.setFont(undefined, "bold"); doc.text("CPF:", M, y);
    doc.setFont(undefined, "normal"); doc.text(_maskCPF(currentUser?.cpf || ""), M + 22, y);
    doc.setFont(undefined, "bold"); doc.text("SUS:", 110, y);
    doc.setFont(undefined, "normal"); doc.text(_maskSUS(currentUser?.sus || ""), 122, y); y += 7;
    doc.setFont(undefined, "bold"); doc.text("Data/Hora:", M, y);
    doc.setFont(undefined, "normal"); doc.text(`${date} às ${time}`, M + 30, y);

    // Separador
    y += 10;
    doc.setDrawColor(221, 227, 238); doc.line(M, y, W - M, y); y += 8;

    // Respostas
    doc.setFontSize(9); doc.setTextColor(100, 116, 139); doc.text("RELATO DO PACIENTE", M, y); y += 7;
    QUESTIONS.forEach((q, i) => {
        if (q.id === "greeting") return;
        const ans = chatData.answers[q.id] || "—";
        const qLines = doc.splitTextToSize(`${i}. ${q.text}`, W - M * 2);
        doc.setFontSize(10); doc.setFont(undefined, "bold"); doc.setTextColor(26, 32, 53);
        doc.text(qLines, M, y); y += qLines.length * 5.5;
        const aLines = doc.splitTextToSize(`R: ${ans}`, W - M * 2);
        doc.setFont(undefined, "normal"); doc.setTextColor(60, 80, 120);
        doc.text(aLines, M, y); y += aLines.length * 5.5 + 4;
        if (y > 260) { doc.addPage(); y = 20; }
    });

    // Resultado
    y += 4; doc.setDrawColor(221, 227, 238); doc.line(M, y, W - M, y); y += 10;
    const classTxt = { U: "URGENTE / EMERGÊNCIA", M: "MÉDIA PRIORIDADE", L: "BAIXA PRIORIDADE" };
    doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.setTextColor(26, 32, 53);
    doc.text(`CLASSIFICAÇÃO: ${classTxt[chatData.classification] || "—"}`, M, y); y += 9;
    doc.setFontSize(20); doc.setTextColor(26, 86, 219);
    doc.text(`SENHA: ${chatData.password || "—"}`, M, y);

    // Rodapé
    doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont(undefined, "italic");
    doc.text("Apresente este documento no guichê · A.M.E.L.I.A v2.0 · FeNaDANTE 2025", W / 2, 285, { align: "center" });

    const fn = `Prontuario_${(currentUser?.nome || "paciente").replace(/\s+/g, "_")}_${date.replace(/\//g, "-")}.pdf`;
    doc.save(fn);
    showToast("Prontuário baixado!", "success");
}

// ── Auxiliares ────────────────────────────────────────────
function _maskCPF(c) {
    if (c.length !== 11) return c;
    return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
}
function _maskSUS(s) {
    if (s.length !== 15) return s;
    return `${s.slice(0,3)} ${s.slice(3,7)} ${s.slice(7,11)} ${s.slice(11)}`;
}
function _esc(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function _scrollBottom() {
    const el = document.getElementById("chat-messages");
    if (el) el.scrollTop = el.scrollHeight;
}
function _calcAge(d) {
    if (!d) return 30;
    const b = new Date(d), t = new Date();
    const a = t.getFullYear() - b.getFullYear();
    return (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) ? a - 1 : a;
}
function _fixLogo() {
    const l = document.getElementById("logo-img");
    if (!l) return;
    l.onerror = () => {
        l.style.display = "none";
        const lt = document.querySelector(".brand-name");
        if (lt) lt.textContent = "🏥 A.M.E.L.I.A";
    };
}
function resetChat() {
    showToast("Iniciando nova triagem…", "success");
    setTimeout(initChat, 450);
}
function showToast(msg, type = "success") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className   = `toast ${type} show`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove("show"), 3200);
}
