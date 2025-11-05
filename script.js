// ===== CONFIGURAÇÕES GLOBAIS =====

// Sequência de senhas personalizada - ALTERE AQUI para modificar a sequência
// Exemplo: ['moo', 'moo', 'l', 'u'] gera: moo1, moo2, l001, u001, moo3, moo4, l002, u002...
const SEQUENCE = ['moo', 'moo', 'l', 'u'];

// Estado global da aplicação
let currentUser = null;
let chatData = {
    messages: [],
    currentStep: 0,
    answers: {},
    classification: null,
    password: null
};

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    // Verificar se há usuário logado
    const loggedUser = localStorage.getItem('currentUser');
    if (loggedUser) {
        currentUser = JSON.parse(loggedUser);
        updateHeaderForLoggedUser();
    }

    // Adicionar máscaras aos inputs
    initInputMasks();

    // Verificar se a logo existe
    checkLogo();
});

// ===== FUNÇÕES DE NAVEGAÇÃO =====
function showScreen(screenName) {
    // Ocultar todas as telas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Mostrar tela solicitada
    const targetScreen = document.getElementById(`screen-${screenName}`);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }

    // Se for o painel e houver usuário logado, iniciar chat
    if (screenName === 'painel' && currentUser) {
        initChat();
    }
}

function updateHeaderForLoggedUser() {
    const navButtons = document.getElementById('nav-buttons');
    navButtons.innerHTML = `
        <span style="color: var(--primary-blue); font-weight: 600;">Olá, ${currentUser.nome.split(' ')[0]}</span>
        <button class="btn btn-primary" onclick="showScreen('painel')">Painel</button>
        <button class="btn btn-secondary" onclick="showScreen('sobre')">Sobre</button>
        <button class="btn btn-secondary" onclick="logout()">Sair</button>
    `;
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    location.reload();
}

// ===== MÁSCARAS DE INPUT =====
function initInputMasks() {
    // Máscara de CPF
    const cpfInputs = document.querySelectorAll('#cad-cpf, #login-id');
    cpfInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                e.target.value = value;
            }
        });
    });

    // Máscara de Cartão SUS
    const susInput = document.getElementById('cad-sus');
    if (susInput) {
        susInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 15) {
                value = value.replace(/(\d{3})(\d)/, '$1 $2');
                value = value.replace(/(\d{4})(\d)/, '$1 $2');
                value = value.replace(/(\d{4})(\d)/, '$1 $2');
                e.target.value = value;
            }
        });
    }

    // Máscara de Telefone
    const telInput = document.getElementById('cad-telefone');
    if (telInput) {
        telInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/(\d{2})(\d)/, '($1) $2');
                value = value.replace(/(\d{5})(\d)/, '$1-$2');
                e.target.value = value;
            }
        });
    }
}

// ===== VALIDAÇÕES =====
function validateCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let digit1 = 11 - (sum % 11);
    if (digit1 > 9) digit1 = 0;

    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    let digit2 = 11 - (sum % 11);
    if (digit2 > 9) digit2 = 0;

    return parseInt(cpf.charAt(9)) === digit1 && parseInt(cpf.charAt(10)) === digit2;
}

function validateSUS(sus) {
    sus = sus.replace(/\D/g, '');
    return sus.length === 15 && /^\d+$/.test(sus);
}

// ===== HASH DE SENHA (SIMULAÇÃO) =====
// IMPORTANTE: Em produção, use bcrypt ou similar no backend!
async function hashPassword(password) {
    // Simulação simples de hash - NÃO USE EM PRODUÇÃO
    // Em ambiente real, isso seria feito no backend com bcrypt
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== CADASTRO =====
async function handleCadastro(event) {
    event.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim();
    const cpf = document.getElementById('cad-cpf').value;
    const sus = document.getElementById('cad-sus').value;
    const nascimento = document.getElementById('cad-nascimento').value;
    const telefone = document.getElementById('cad-telefone').value;
    const senha = document.getElementById('cad-senha').value;
    const senhaConfirm = document.getElementById('cad-senha-confirm').value;

    // Validações
    if (!validateCPF(cpf)) {
        showToast('CPF inválido! Verifique os dígitos.', 'error');
        return;
    }

    if (!validateSUS(sus)) {
        showToast('Cartão SUS inválido! Deve conter 15 dígitos.', 'error');
        return;
    }

    if (senha !== senhaConfirm) {
        showToast('As senhas não coincidem!', 'error');
        return;
    }

    // Verificar se já existe
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const cpfClean = cpf.replace(/\D/g, '');
    const susClean = sus.replace(/\D/g, '');

    if (users.find(u => u.cpf === cpfClean || u.sus === susClean)) {
        showToast('CPF ou Cartão SUS já cadastrado!', 'error');
        return;
    }

    // Criar usuário
    const senhaHash = await hashPassword(senha);
    const newUser = {
        nome,
        cpf: cpfClean,
        sus: susClean,
        nascimento,
        telefone: telefone.replace(/\D/g, ''),
        senhaHash
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    showToast('Cadastro realizado com sucesso! Faça login.', 'success');
    
    // Limpar formulário
    document.getElementById('form-cadastro').reset();
    
    setTimeout(() => {
        showScreen('login');
    }, 1500);
}

// ===== LOGIN =====
async function handleLogin(event) {
    event.preventDefault();

    const id = document.getElementById('login-id').value.replace(/\D/g, '');
    const senha = document.getElementById('login-senha').value;

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const senhaHash = await hashPassword(senha);

    const user = users.find(u => 
        (u.cpf === id || u.sus === id) && u.senhaHash === senhaHash
    );

    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        showToast('Login realizado com sucesso!', 'success');
        updateHeaderForLoggedUser();
        
        setTimeout(() => {
            showScreen('painel');
        }, 1000);
    } else {
        showToast('CPF/SUS ou senha incorretos!', 'error');
    }
}

// ===== SISTEMA DE CHAT =====
const CHAT_QUESTIONS = [
    {
        id: 'greeting',
        text: 'Olá! Eu sou a AMÉLIA 🤖. É um prazer ajudá-lo hoje. Como você está se sentindo?',
        type: 'text'
    },
    {
        id: 'pain_level',
        text: 'De 1 a 10, qual o seu nível de dor ou desconforto? (1 = muito leve, 10 = insuportável)',
        type: 'number',
        validate: (value) => value >= 1 && value <= 10
    },
    {
        id: 'symptoms',
        text: 'Você está com febre, falta de ar ou outro sintoma grave?',
        type: 'text'
    },
    {
        id: 'duration',
        text: 'Há quanto tempo os sintomas começaram? (Ex: 2 dias, 1 semana, algumas horas)',
        type: 'text'
    },
    {
        id: 'additional',
        text: 'Há mais alguma informação importante que você gostaria de compartilhar?',
        type: 'text'
    }
];

function initChat() {
    chatData = {
        messages: [],
        currentStep: 0,
        answers: {},
        classification: null,
        password: null
    };

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    
    document.getElementById('chat-input-area').style.display = 'flex';
    document.getElementById('chat-actions').style.display = 'none';
    
    // Mostrar primeira mensagem
    setTimeout(() => {
        addBotMessage(CHAT_QUESTIONS[0].text);
        enableChatInput();
    }, 500);
}

function addBotMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    
    // Mostrar indicador de digitação
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message message-bot';
    typingDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();

    // Após um delay, remover digitação e mostrar mensagem
    setTimeout(() => {
        typingDiv.remove();
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-bot';
        messageDiv.innerHTML = `
            <div class="avatar">🤖</div>
            <div class="message-content">${text}</div>
        `;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }, 1000 + Math.random() * 500);
}

function addUserMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-user';
    messageDiv.innerHTML = `
        <div class="message-content">${text}</div>
    `;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function enableChatInput() {
    const input = document.getElementById('chat-input');
    const button = document.getElementById('chat-send');
    input.disabled = false;
    button.disabled = false;
    input.focus();

    // Permitir Enter para enviar
    input.onkeypress = function(e) {
        if (e.key === 'Enter' && !button.disabled) {
            sendMessage();
        }
    };
}

function disableChatInput() {
    const input = document.getElementById('chat-input');
    const button = document.getElementById('chat-send');
    input.disabled = true;
    button.disabled = true;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Adicionar mensagem do usuário
    addUserMessage(message);
    input.value = '';
    disableChatInput();

    // Salvar resposta
    const currentQuestion = CHAT_QUESTIONS[chatData.currentStep];
    chatData.answers[currentQuestion.id] = message;

    // Processar próxima pergunta
    chatData.currentStep++;

    if (chatData.currentStep < CHAT_QUESTIONS.length) {
        // Próxima pergunta
        setTimeout(() => {
            // Mensagem de reconhecimento empática
            const ackMessages = [
                'Entendo. Obrigada por compartilhar isso comigo.',
                'Sinto muito que esteja passando por isso.',
                'Agradeço pela sua confiança em relatar isso.',
                'Compreendo sua situação.'
            ];
            const ack = ackMessages[Math.floor(Math.random() * ackMessages.length)];
            addBotMessage(ack);

            setTimeout(() => {
                addBotMessage(CHAT_QUESTIONS[chatData.currentStep].text);
                enableChatInput();
            }, 1500);
        }, 800);
    } else {
        // Finalizar triagem
        finishChat();
    }
}

function finishChat() {
    setTimeout(() => {
        addBotMessage('Obrigada pelas informações! Vou analisar seus dados e gerar sua senha de atendimento.');

        setTimeout(() => {
            // Classificar urgência
            const painLevel = parseInt(chatData.answers.pain_level) || 0;
            const symptoms = chatData.answers.symptoms.toLowerCase();
            
            let classification;
            if (painLevel >= 8 || symptoms.includes('febre') || symptoms.includes('falta de ar') || 
                symptoms.includes('respirar') || symptoms.includes('grave')) {
                classification = 'U'; // Urgente
            } else if (painLevel >= 5) {
                classification = 'M'; // Médio
            } else {
                classification = 'L'; // Leve
            }

            chatData.classification = classification;
            chatData.password = generatePassword(classification);

            // Mostrar resultado
            const classificationText = {
                'U': 'URGENTE - Você será atendido em breve',
                'M': 'MÉDIA PRIORIDADE - Aguarde na fila de atendimento',
                'L': 'BAIXA PRIORIDADE - Aguarde ser chamado'
            };

            const priorityClass = `priority-${classification}`;
            
            addBotMessage(`
                Sua triagem foi concluída com sucesso!<br><br>
                <strong>Classificação:</strong><br>
                <span class="${priorityClass} priority-badge">${classificationText[classification]}</span><br><br>
                <strong>Sua senha:</strong> <span style="font-size: 1.5em; font-weight: bold; color: var(--primary-blue);">${chatData.password}</span><br><br>
                Por favor, baixe seu prontuário em PDF e apresente-o no guichê de atendimento.
            `);

            // Mostrar botões de ação
            document.getElementById('chat-input-area').style.display = 'none';
            document.getElementById('chat-actions').style.display = 'flex';
        }, 2000);
    }, 1000);
}

// ===== GERAÇÃO DE SENHA =====
function generatePassword(classification) {
    // Recuperar contadores do localStorage
    let counters = JSON.parse(localStorage.getItem('passwordCounters') || '{}');
    
    // Inicializar contadores se não existirem
    SEQUENCE.forEach(prefix => {
        if (!counters[prefix]) {
            counters[prefix] = 0;
        }
    });

    // Determinar qual prefixo usar baseado na classificação
    // ou seguir a sequência se for moo
    let prefix;
    if (classification === 'U') {
        prefix = 'u';
    } else if (classification === 'M') {
        prefix = 'm';
    } else if (classification === 'L') {
        prefix = 'l';
    } else {
        // Usar sequência
        const sequenceIndex = Object.values(counters).reduce((a, b) => a + b, 0) % SEQUENCE.length;
        prefix = SEQUENCE[sequenceIndex];
    }

    // Incrementar contador
    counters[prefix]++;
    
    // Gerar senha
    const number = String(counters[prefix]).padStart(prefix === 'moo' ? 1 : 3, '0');
    const password = prefix + number;

    // Salvar contadores
    localStorage.setItem('passwordCounters', JSON.stringify(counters));

    return password;
}

// ===== GERAÇÃO DE PDF =====
function generatePDF() {
    // Verificar se jsPDF está disponível
    if (typeof window.jspdf === 'undefined') {
        showToast('Erro ao carregar biblioteca de PDF. Recarregue a página.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Título
    doc.setFontSize(20);
    doc.setTextColor(0, 102, 204);
    doc.text('PRONTUÁRIO DE TRIAGEM', 105, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('A.M.E.L.I.A', 105, 30, { align: 'center' });

    // Linha separadora
    doc.setDrawColor(0, 102, 204);
    doc.line(20, 35, 190, 35);

    // Dados do paciente
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO PACIENTE', 20, 45);
    doc.setFont(undefined, 'normal');
    
    doc.text(`Nome: ${currentUser.nome}`, 20, 55);
    doc.text(`CPF: ${maskCPF(currentUser.cpf)}`, 20, 62);
    doc.text(`Cartão SUS: ${maskSUS(currentUser.sus)}`, 20, 69);

    // Data e hora
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');
    doc.text(`Data: ${dateStr}`, 20, 76);
    doc.text(`Hora: ${timeStr}`, 20, 83);

    // Linha separadora
    doc.line(20, 88, 190, 88);

    // Respostas da triagem
    doc.setFont(undefined, 'bold');
    doc.text('INFORMAÇÕES DA TRIAGEM', 20, 98);
    doc.setFont(undefined, 'normal');

    let y = 108;
    CHAT_QUESTIONS.forEach((q, index) => {
        if (q.id === 'greeting') return; // Pular saudação
        
        const answer = chatData.answers[q.id] || '';
        
        // Quebrar texto longo
        const questionText = `${index}. ${q.text}`;
        const questionLines = doc.splitTextToSize(questionText, 170);
        doc.setFont(undefined, 'bold');
        doc.text(questionLines, 20, y);
        y += questionLines.length * 7;

        const answerLines = doc.splitTextToSize(`R: ${answer}`, 170);
        doc.setFont(undefined, 'normal');
        doc.text(answerLines, 20, y);
        y += answerLines.length * 7 + 5;

        // Nova página se necessário
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
    });

    // Linha separadora
    y += 5;
    doc.line(20, y, 190, y);
    y += 10;

    // Classificação e senha
    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    
    const classText = {
        'U': 'URGENTE',
        'M': 'MÉDIA PRIORIDADE',
        'L': 'BAIXA PRIORIDADE'
    };

    doc.text(`CLASSIFICAÇÃO: ${classText[chatData.classification]}`, 20, y);
    y += 10;
    
    doc.setFontSize(16);
    doc.setTextColor(0, 102, 204);
    doc.text(`SENHA: ${chatData.password}`, 20, y);

    // Rodapé
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'italic');
    const footer = 'Leve este prontuário ao guichê de atendimento.';
    doc.text(footer, 105, 280, { align: 'center' });

    // Salvar PDF
    const filename = `Prontuario_${currentUser.nome.replace(/\s/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`;
    doc.save(filename);

    showToast('Prontuário baixado com sucesso!', 'success');
}

// ===== FUNÇÕES AUXILIARES =====
function maskCPF(cpf) {
    return `${cpf.substr(0, 3)}.${cpf.substr(3, 3)}.${cpf.substr(6, 3)}-${cpf.substr(9, 2)}`;
}

function maskSUS(sus) {
    return `${sus.substr(0, 3)} ${sus.substr(3, 4)} ${sus.substr(7, 4)} ${sus.substr(11, 4)}`;
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function resetChat() {
    showToast('Iniciando nova triagem...', 'success');
    setTimeout(() => {
        initChat();
    }, 500);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function checkLogo() {
    const logo = document.getElementById('logo-img');
    logo.onerror = function() {
        // Se a logo não carregar, usar emoji como fallback
        this.style.display = 'none';
        const logoText = document.querySelector('.logo-text');
        logoText.textContent = '🏥 A.M.E.L.I.A';
    };
}

// ===== INSTRUÇÕES PARA DESENVOLVEDORES =====
/*
CONFIGURAÇÃO DO SISTEMA:

1. SEQUÊNCIA DE SENHAS:
   - Edite a constante SEQUENCE no topo deste arquivo
   - Exemplo: const SEQUENCE = ['moo', 'moo', 'l', 'u'];
   - As senhas seguirão essa ordem: moo1, moo2, l001, u001, moo3, moo4, l002, u002...

2. LIMPAR DADOS PARA TESTES:
   - Abra o Console do navegador (F12)
   - Execute: localStorage.clear()
   - Recarregue a página

3. TROCAR LOGO:
   - Substitua o arquivo AmeliaCVPS.png na pasta raiz
   - Ou edite o src no HTML: <img src="AmeliaCVPS.png" ...>

4. SEGURANÇA (IMPORTANTE):
   - Este código usa localStorage e hash SHA-256 APENAS para demonstração
   - Em produção, NUNCA armazene dados sensíveis no frontend
   - Use um backend seguro com:
     * Banco de dados protegido
     * Hash bcrypt para senhas
     * HTTPS obrigatório
     * Autenticação JWT ou similar
     * Validação server-side

5. PERSONALIZAÇÃO DO CHAT:
   - Edite o array CHAT_QUESTIONS para alterar perguntas
   - Modifique a função finishChat() para mudar a lógica de classificação

6. COMPATIBILIDADE:
   - Funciona em GitHub Pages sem configuração adicional
   - Requer navegador moderno (Chrome, Firefox, Safari, Edge)
*/