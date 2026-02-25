const STORAGE_KEY = "tytronis_chat";
const MEMORY_KEY = "tytronis_memory";

const chatDiv = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const typingDiv = document.getElementById("typing");
const resetBtn = document.getElementById("resetChat");
const themeBtn = document.getElementById("themeToggle");

const modeSelected = document.getElementById("modeSelected");
const modeMenu = document.getElementById("modeMenu");
const modeOptions = document.querySelectorAll(".mode-option");

/* ---------- MÉMOIRE INTELLIGENTE ---------- */
let memory = {
  name: null,
  responseStyle: "normal",
  projects: [],
  theme: "dark"
};

const savedMemory = localStorage.getItem(MEMORY_KEY);
if (savedMemory) memory = JSON.parse(savedMemory);

/* ---------- METTRE À JOUR LE MENU ---------- */
function updateModeDropdown() {
  modeOptions.forEach(opt => {
    opt.classList.toggle("active", opt.dataset.mode === memory.responseStyle);
  });

  const label =
    memory.responseStyle === "court" ? "Court" :
    memory.responseStyle === "long" ? "Long" :
    "Normal";

  modeSelected.textContent = "Mode : " + label + " ▼";
}
updateModeDropdown();

/* ---------- MENU DÉROULANT ---------- */
modeSelected.addEventListener("click", () => {
  modeMenu.style.display = modeMenu.style.display === "flex" ? "none" : "flex";
});

modeOptions.forEach(opt => {
  opt.addEventListener("click", () => {
    memory.responseStyle = opt.dataset.mode;
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    updateModeDropdown();
    modeMenu.style.display = "none";
  });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".mode-dropdown")) {
    modeMenu.style.display = "none";
  }
});

/* ---------- DÉTECTION DE LANGUE ---------- */
function detectLanguage(text) {
  const french = /[éèêàùçôîû]/i;
  const spanish = /[ñáéíóúü]/i;

  if (french.test(text)) return "fr";
  if (spanish.test(text)) return "es";

  return "en"; // fallback
}

/* ---------- MISE À JOUR DE LA MÉMOIRE ---------- */
function updateMemory(userMessage) {
  const nameMatch = userMessage.match(/je m'appelle ([a-zA-Z]+)/i);
  if (nameMatch) memory.name = nameMatch[1];

  if (/réponds court|mode court|bref/i.test(userMessage))
    memory.responseStyle = "court";

  if (/réponds long|mode long|détaille/i.test(userMessage))
    memory.responseStyle = "long";

  if (/projet/i.test(userMessage))
    memory.projects.push(userMessage);

  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  updateModeDropdown();
}

/* ---------- SYSTEM MESSAGE ---------- */
function buildSystemMessage() {
  return {
    role: "system",
    content: `
Tu es Tytronis.

Règle de langue :
- Tu détectes la langue du message utilisateur.
- Tu réponds dans cette langue.
- Si tu ne détectes rien, réponds en français.

Mémoire :
Nom : ${memory.name || "inconnu"}
Style : ${memory.responseStyle}
Projets : ${memory.projects.join(", ") || "aucun"}

Styles :
- court → réponses courtes, directes.
- normal → réponses équilibrées.
- long → réponses détaillées.

Règles :
- N'indique jamais que tu utilises une mémoire.
- Utilise ces infos naturellement.
- Si l'utilisateur veut que tu arrêtes d'utiliser son nom, arrête de l'utiliser.
`
  };
}

let history = [buildSystemMessage()];

/* ---------- RESTAURER ---------- */
function restoreChat() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  const messages = JSON.parse(saved);
  history = [buildSystemMessage(), ...messages];

  messages.forEach(msg => {
    const row = document.createElement("div");
    row.className = "bubble-row " + (msg.role === "user" ? "user" : "ai");

    const bubble = document.createElement("div");
    bubble.className = "bubble " + msg.role;
    bubble.textContent = msg.content;

    if (msg.role === "assistant") {
      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copier";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content);
        copyBtn.textContent = "Copié !";
        setTimeout(() => (copyBtn.textContent = "Copier"), 1200);
      };
      row.appendChild(copyBtn);
    }

    row.appendChild(bubble);
    chatDiv.appendChild(row);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
}

/* ---------- SAUVEGARDE ---------- */
function saveChat() {
  const toSave = history.filter(m => m.role !== "system");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

/* ---------- TYPEWRITER ---------- */
function typeWriterEffect(text, bubble) {
  bubble.textContent = "";
  let i = 0;
  function type() {
    if (i < text.length) {
      bubble.textContent += text.charAt(i);
      i++;
      chatDiv.scrollTop = chatDiv.scrollHeight;
      setTimeout(type, 15);
    }
  }
  type();
}

/* ---------- ENVOI (APPEL GROQ VIA WORKER) ---------- */
async function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  updateMemory(message);

  const userRow = document.createElement("div");
  userRow.className = "bubble-row user";
  const userBubble = document.createElement("div");
  userBubble.className = "bubble user";
  userBubble.textContent = message;
  userRow.appendChild(userBubble);
  chatDiv.appendChild(userRow);

  history.push({ role: "user", content: message });
  saveChat();

  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;

  typingDiv.textContent = "Tytronis écrit...";

  const lang = detectLanguage(message);

  try {
    const response = await fetch("https://tytronis.guilhem-bouscary.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          buildSystemMessage(),
          { role: "system", content: "Réponds dans la langue détectée : " + lang },
          ...history
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      typingDiv.textContent = "";
      const errorBubble = document.createElement("div");
      errorBubble.className = "bubble ai";
      errorBubble.textContent = "Erreur API : " + data.error.message;
      chatDiv.appendChild(errorBubble);
      sendBtn.disabled = false;
      return;
    }

    const reply = data.choices[0].message.content;
    history.push({ role: "assistant", content: reply });
    saveChat();

    setTimeout(() => {
      typingDiv.textContent = "";

      const aiRow = document.createElement("div");
      aiRow.className = "bubble-row ai";

      const aiBubble = document.createElement("div");
      aiBubble.className = "bubble ai";

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copier";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(reply);
        copyBtn.textContent = "Copié !";
        setTimeout(() => (copyBtn.textContent = "Copier"), 1200);
      };

      aiRow.appendChild(aiBubble);
      aiRow.appendChild(copyBtn);
      chatDiv.appendChild(aiRow);

      typeWriterEffect(reply, aiBubble);
    }, 1000);

  } catch (err) {
    typingDiv.textContent = "";
    const errorBubble = document.createElement("div");
    errorBubble.className = "bubble ai";
    errorBubble.textContent = "Erreur de connexion.";
    chatDiv.appendChild(errorBubble);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ---------- RESET ---------- */
resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MEMORY_KEY);
  chatDiv.innerHTML = "";
  typingDiv.textContent = "";
  memory = {
    name: null,
    responseStyle: "normal",
    projects: [],
    theme: "dark"
  };
  history = [buildSystemMessage()];
  updateModeDropdown();
});

/* ---------- THÈME ---------- */
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  themeBtn.textContent = isLight ? "☀️" : "🌙";

  memory.theme = isLight ? "light" : "dark";
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
});

/* ---------- AUTO-HEIGHT + ENTRÉE ---------- */
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
});

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ---------- AU CHARGEMENT ---------- */
restoreChat();
