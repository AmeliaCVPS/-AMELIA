/* ═══════════════════════════════════════════════════════════
   voice.js — Módulo de Voz da AMÉLIA
   ───────────────────────────────────────────────────────────
   Responsabilidades:
     1. checkAPIStatus()  — pinga o backend e atualiza indicador
     2. speak(text)       — texto → fala (TTS nativo)
     3. toggleRecording() — liga/desliga microfone
     4. _processVoice()   — envia transcrição à API ou chatbot local

   Compatibilidade: Chrome/Edge (pleno). Safari (parcial).
   Firefox não suporta SpeechRecognition nativamente.
   ═══════════════════════════════════════════════════════════ */

// ── URL da API ────────────────────────────────────────────
// Detecta automaticamente: localhost → porta 8000, produção → relativo
const API_BASE_URL =
    (window.location.hostname === "localhost" ||
     window.location.hostname === "127.0.0.1")
        ? "http://localhost:8000"
        : "";

// ── Estado do módulo ──────────────────────────────────────
const voiceState = {
    isRecording: false,
    recognition: null,
    synthesis:   window.speechSynthesis || null,
    transcript:  "",
    apiOnline:   false,
};

// ═══════════════════════════════════════════════════════════
// 1. STATUS DA API
// ═══════════════════════════════════════════════════════════

async function checkAPIStatus() {
    const dot = document.getElementById("api-indicator");
    const txt = document.getElementById("api-status");

    try {
        const res = await fetch(`${API_BASE_URL}/api/health`, {
            signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
            voiceState.apiOnline = true;
            if (dot) dot.textContent = "🟢";
            if (txt) txt.textContent = "Assistente Online · IA ativa";
        } else {
            throw new Error("status " + res.status);
        }
    } catch {
        voiceState.apiOnline = false;
        if (dot) dot.textContent = "🔴";
        if (txt) txt.textContent = "Modo local · backend offline";
    }
}

// ═══════════════════════════════════════════════════════════
// 2. SÍNTESE DE VOZ  (texto → fala)
// ═══════════════════════════════════════════════════════════

function speak(text, onEnd) {
    if (!voiceState.synthesis) return;

    voiceState.synthesis.cancel();

    // Remove tags HTML
    const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return;

    const utt  = new SpeechSynthesisUtterance(clean);
    utt.lang   = "pt-BR";
    utt.rate   = 0.92;
    utt.pitch  = 1.05;
    utt.volume = 1.0;

    const tryVoice = () => {
        const all = voiceState.synthesis.getVoices();
        const fem = all.find(v => v.lang.startsWith("pt") &&
                                  v.name.toLowerCase().includes("female"));
        const any = all.find(v => v.lang.startsWith("pt"));
        if (fem || any) utt.voice = fem || any;
    };

    if (voiceState.synthesis.getVoices().length) {
        tryVoice();
    } else {
        voiceState.synthesis.addEventListener("voiceschanged", tryVoice, { once: true });
    }

    if (onEnd) utt.onend = onEnd;
    voiceState.synthesis.speak(utt);
}

// ═══════════════════════════════════════════════════════════
// 3. RECONHECIMENTO DE VOZ  (fala → texto)
// ═══════════════════════════════════════════════════════════

function _checkVoiceSupport() {
    const supported = "SpeechRecognition" in window ||
                      "webkitSpeechRecognition" in window;
    const btn = document.getElementById("btn-voice");
    if (!supported && btn) {
        btn.disabled     = true;
        btn.title        = "Reconhecimento de voz não suportado. Use o Chrome.";
        btn.style.opacity = "0.35";
    }
    return supported;
}

function _buildRecognition() {
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();

    rec.lang           = "pt-BR";
    rec.continuous     = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        voiceState.isRecording = true;
        _micBtn(true);
        _setFb("🎙️ Ouvindo… Fale e clique em ⏹️ quando terminar.");
    };

    rec.onresult = (ev) => {
        let final = "", interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const seg = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) final  += seg + " ";
            else                       interim += seg;
        }
        voiceState.transcript += final;
        const inp = document.getElementById("chat-input");
        if (inp) inp.value = voiceState.transcript + interim;
    };

    rec.onerror = (ev) => {
        const msgs = {
            "no-speech":    "Não detectei sua voz. Fale mais perto do microfone.",
            "audio-capture":"Microfone inacessível. Verifique a conexão.",
            "not-allowed":  "Permissão negada. Habilite o microfone no navegador.",
            "network":      "Erro de rede durante o reconhecimento de voz.",
        };
        showToast(msgs[ev.error] || "Erro no microfone: " + ev.error, "error");
        stopRecording();
    };

    rec.onend = () => {
        if (voiceState.isRecording) {
            try { rec.start(); } catch { /* já encerrou */ }
        }
    };

    return rec;
}

// ── Controles públicos ────────────────────────────────────

function startRecording() {
    if (!_checkVoiceSupport()) return;
    voiceState.transcript  = "";
    voiceState.recognition = _buildRecognition();
    try {
        voiceState.recognition.start();
    } catch (e) {
        showToast("Não foi possível iniciar o microfone: " + e.message, "error");
    }
}

function stopRecording() {
    voiceState.isRecording = false;
    if (voiceState.recognition) {
        voiceState.recognition.stop();
        voiceState.recognition = null;
    }
    _micBtn(false);
    _setFb("✅ Gravação finalizada.");
}

function toggleRecording() {
    if (voiceState.isRecording) {
        stopRecording();
        const txt = voiceState.transcript.trim();
        if (txt) {
            _processVoice(txt);
        } else {
            _setFb("⚠️ Nenhum áudio captado. Tente novamente.");
        }
    } else {
        startRecording();
        speak("Por favor, descreva seus sintomas. Clique em parar quando terminar.");
    }
}

// ═══════════════════════════════════════════════════════════
// 4. PROCESSAMENTO DO ÁUDIO
// ═══════════════════════════════════════════════════════════

async function _processVoice(transcript) {
    // addUserMessage e showToast vêm de script.js (carregado depois)
    addUserMessage("🎙️ " + transcript);
    _setFb("⏳ Classificando com IA…");

    if (!voiceState.apiOnline) {
        _setFb("⚠️ Backend offline — usando classificação local.");
        const inp = document.getElementById("chat-input");
        if (inp) inp.value = transcript;
        return;
    }

    try {
        const age = (typeof currentUser !== "undefined" && currentUser)
            ? _age(currentUser.nascimento) : 30;
        const sex = (currentUser && currentUser.sexo) ? currentUser.sexo : "M";
        const cpf = (currentUser && currentUser.cpf)  ? currentUser.cpf  : "00000000000";

        const res = await fetch(`${API_BASE_URL}/api/classify/from-text`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text: transcript, cpf, age, sex }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);

        _showAPIResult(await res.json());

    } catch (err) {
        console.warn("Falha na API de voz:", err);
        showToast("Erro na IA — usando classificação local.", "warning");
        _setFb("⚠️ Usando modo local por falha na API.");
        const inp = document.getElementById("chat-input");
        if (inp) inp.value = transcript;
    }
}

function _showAPIResult(result) {
    const { password, classification } = result;

    const emojiMap = { red:"🔴", orange:"🟠", yellow:"🟡", green:"🟢" };
    const classMap = { red:"prio-red", orange:"prio-orange",
                       yellow:"prio-yellow", green:"prio-green" };

    const emoji  = emojiMap[classification.color]  || "⚪";
    const pClass = classMap[classification.color]   || "prio-green";
    const conf   = (classification.confidence * 100).toFixed(1);

    addBotMessage(`
        <span class="prio-badge ${pClass}">${emoji} ${classification.explanation}</span><br><br>
        ⏱️ Espera estimada: <strong>${classification.wait_time}</strong><br><br>
        🎫 Sua senha de atendimento:<br>
        <span style="font-family:var(--font-display);font-size:2.1rem;font-weight:700;
                     color:var(--c-blue);letter-spacing:.08em;">${password}</span><br>
        <small style="color:var(--c-muted)">Confiança da IA: ${conf}%</small>
    `);

    speak(
        `Triagem concluída. ${classification.explanation} ` +
        `Tempo de espera: ${classification.wait_time}. ` +
        `Sua senha é ${password.split("").join(" ")}.`
    );

    if (typeof chatData !== "undefined") {
        chatData.password       = password;
        chatData.classification =
            classification.color === "red"    ? "U" :
            classification.color === "orange" ? "U" :
            classification.color === "yellow" ? "M" : "L";
        chatData.apiResult = result;
    }

    document.getElementById("chat-input-area").style.display = "none";
    document.getElementById("chat-actions").style.display    = "flex";
    _setFb("");
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function _micBtn(recording) {
    const btn = document.getElementById("btn-voice");
    if (!btn) return;
    btn.textContent = recording ? "⏹️" : "🎙️";
    btn.title       = recording ? "Parar gravação" : "Clique para falar";
    btn.classList.toggle("recording", recording);
}

function _setFb(msg) {
    const el = document.getElementById("voice-feedback");
    if (el) el.textContent = msg;
}

function _age(dateStr) {
    if (!dateStr) return 30;
    const b = new Date(dateStr), t = new Date();
    const a = t.getFullYear() - b.getFullYear();
    return (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) ? a - 1 : a;
}

document.addEventListener("DOMContentLoaded", _checkVoiceSupport);
