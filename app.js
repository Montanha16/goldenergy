const LEVELS = [
  { name: "Faísca Verde", min: 0, max: 500 },
  { name: "Modo Eco", min: 501, max: 1200 },
  { name: "Turbo Eficiência", min: 1201, max: 2600 },
  { name: "Alta Eficiência", min: 2601, max: 4000 },
  { name: "Lenda Sustentável", min: 4001, max: 7000 }
];

const STORAGE_KEY = "goldenergy-gamification";

const defaultState = {
  xp: 0,
  paidInvoices: 0,
  shares: 0,
  consumptionHistory: [],
  notifications: [],
  achievements: []
};

const state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaultState };

  try {
    const parsed = JSON.parse(raw);
    const achievements = Array.isArray(parsed.achievements)
      ? parsed.achievements
      : Array.from({ length: parsed.achievements || 0 }, () => "Conquista de pontos");
    return { ...defaultState, ...parsed, achievements };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 1800);
}

function addXp(amount, reason) {
  state.xp += amount;
  const achievement = `${reason} (+${amount} XP)`;
  state.achievements.unshift(achievement);
  state.achievements = state.achievements.slice(0, 20);

  const item = `${new Date().toLocaleString("pt-PT")} — +${amount} XP: ${reason}`;
  state.notifications.unshift(item);
  state.notifications = state.notifications.slice(0, 30);

  saveState();
  render();
  showToast(`Ganhaste ${amount} XP!`);
}

function getCurrentLevel(xp) {
  return LEVELS.find((level) => xp >= level.min && xp <= level.max) || LEVELS[LEVELS.length - 1];
}

function getNextLevel(xp) {
  return LEVELS.find((level) => level.min > xp);
}

function switchToPage(targetId) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.target === targetId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === targetId);
  });
}

function consumptionAward(kwh) {
  if (kwh < 200) return 60;
  if (kwh < 700) return 40;
  if (kwh < 900) return 20;
  return 0;
}

function render() {
  const level = getCurrentLevel(state.xp);
  const nextLevel = getNextLevel(state.xp);

  document.getElementById("xpValue").textContent = `${state.xp} XP`;
  document.getElementById("levelValue").textContent = level.name;
  document.getElementById("levelTag").textContent = level.name;

  const percent = Math.min(100, ((state.xp - level.min) / Math.max(1, level.max - level.min)) * 100);
  document.getElementById("xpProgress").style.width = `${percent}%`;
  document.getElementById("nextLevelInfo").textContent = nextLevel
    ? `${Math.max(0, nextLevel.min - state.xp)} XP para chegar a ${nextLevel.name}`
    : "Nível máximo atingido. És uma Lenda Sustentável!";

  document.getElementById("paidInvoicesCount").textContent = state.paidInvoices;
  document.getElementById("sharesCount").textContent = state.shares;
  document.getElementById("monthsCount").textContent = state.consumptionHistory.length;

  document.getElementById("profileLevel").textContent = level.name;
  document.getElementById("profileXp").textContent = `${state.xp} XP`;

  document.getElementById("achievedXp").textContent = state.xp;
  document.getElementById("achievementsCount").textContent = state.achievements.length;

  document.getElementById("consumptionList").innerHTML =
    state.consumptionHistory.length > 0
      ? state.consumptionHistory
          .map(
            (entry) =>
              `<li><strong>${entry.month}</strong>: ${entry.kwh} kWh (${entry.award > 0 ? `+${entry.award} XP` : "sem XP"})</li>`
          )
          .join("")
      : "<li>Ainda não há consumos registados.</li>";

  document.getElementById("notificationList").innerHTML =
    state.notifications.length > 0
      ? state.notifications.map((msg) => `<li>${msg}</li>`).join("")
      : "<li>Ainda não tens notificações.</li>";

  document.getElementById("levelsList").innerHTML = LEVELS.map(
    (lvl) => `<li>${lvl.name}: ${lvl.min} a ${lvl.max} XP</li>`
  ).join("");

  document.getElementById("achievementsList").innerHTML =
    state.achievements.length > 0
      ? state.achievements.map((item) => `<li>${item}</li>`).join("")
      : "<li>Ainda não tens conquistas.</li>";
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchToPage(button.dataset.target));
  });

  document.querySelectorAll(".nav-shortcut").forEach((button) => {
    button.addEventListener("click", () => switchToPage(button.dataset.target));
  });

  document.getElementById("consumptionForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const month = document.getElementById("monthInput").value;
    const kwh = Number(document.getElementById("kwhInput").value);

    if (!month || Number.isNaN(kwh) || kwh < 0) return;

    const existingIndex = state.consumptionHistory.findIndex((item) => item.month === month);
    const award = consumptionAward(kwh);

    if (existingIndex >= 0) {
      state.consumptionHistory.splice(existingIndex, 1);
      state.notifications.unshift(`${new Date().toLocaleString("pt-PT")} — consumo de ${month} atualizado.`);
    }

    state.consumptionHistory.unshift({ month, kwh, award });
    state.consumptionHistory = state.consumptionHistory.slice(0, 12);

    if (award > 0) {
      addXp(award, `Consumo mensal (${month}) eficiente`);
    } else {
      saveState();
      render();
    }

    event.target.reset();
  });

  document.getElementById("payInvoiceBtn").addEventListener("click", () => {
    state.paidInvoices += 1;
    addXp(50, "Pagamento de fatura");
  });

  document.getElementById("shareCodeBtn").addEventListener("click", async () => {
    const code = "GOLDENERGY-POUPA";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
    } catch {
      // Ignore clipboard issues in unsupported browsers/contexts.
    }
    state.shares += 1;
    addXp(50, "Partilha de código Goldenergy");
  });
}

bindEvents();
render();
