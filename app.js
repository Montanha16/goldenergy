const LEVELS = [
  { name: "Faísca Verde", min: 0, max: 500 },
  { name: "Modo Eco", min: 501, max: 1200 },
  { name: "Turbo Eficiência", min: 1201, max: 2600 },
  { name: "Alta Eficiência", min: 2601, max: 4000 },
  { name: "Lenda Sustentável", min: 4001, max: 7000 }
];

const CHALLENGES = [
  {
    id: "peak-reduction",
    label: "Reduzir consumo em 10% nas horas de ponta",
    xp: 40
  },
  {
    id: "saving-tip",
    label: "Partilhar dica de poupança",
    xp: 65
  }
];

const DISCOUNT_MILESTONES = Array.from({ length: 10 }, (_, idx) => (idx + 1) * 500);
const STORAGE_KEY = "goldenergy-gamification";

const defaultState = {
  xp: 0,
  paidInvoices: 0,
  shares: 0,
  consumptionHistory: [],
  notifications: [],
  achievements: 0,
  xpHistory: [],
  spendHistory: [],
  claimedChallenges: [],
  challengeProgress: {}
};

const state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaultState };

  try {
    const parsed = { ...defaultState, ...JSON.parse(raw) };
    parsed.notifications = (parsed.notifications || []).map((entry) => {
      if (typeof entry === "string") {
        return {
          type: "info",
          message: entry,
          date: new Date().toLocaleString("pt-PT")
        };
      }

      return entry;
    });

    parsed.xpHistory = parsed.xpHistory || [];
    parsed.spendHistory = parsed.spendHistory || [];
    parsed.claimedChallenges = parsed.claimedChallenges || [];
    parsed.challengeProgress = parsed.challengeProgress || {};
    return parsed;
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushNotification(type, message) {
  state.notifications.unshift({
    type,
    message,
    date: new Date().toLocaleString("pt-PT")
  });
  state.notifications = state.notifications.slice(0, 40);
}

function getDiscountsUnlocked(xp) {
  return DISCOUNT_MILESTONES.filter((milestone) => xp >= milestone).length;
}

function getDiscountsAvailable() {
  return Math.max(0, getDiscountsUnlocked(state.xp) - state.spendHistory.length);
}

function getCo2SavedKg() {
  return state.consumptionHistory
    .filter((entry) => entry.kwh < 700)
    .reduce((total, entry) => {
      const baseline = 700;
      const diff = Math.max(0, baseline - entry.kwh);
      return total + diff * 0.12;
    }, 0);
}

function addXp(amount, reason) {
  const previousXp = state.xp;
  state.xp += amount;
  state.achievements += 1;

  state.xpHistory.unshift({
    date: new Date().toLocaleString("pt-PT"),
    amount,
    reason
  });
  state.xpHistory = state.xpHistory.slice(0, 40);

  pushNotification("xp", `+${amount} XP — ${reason}`);

  const newlyReachedMilestones = DISCOUNT_MILESTONES.filter(
    (milestone) => previousXp < milestone && state.xp >= milestone
  );

  newlyReachedMilestones.forEach((milestone) => {
    pushNotification("desconto", `Atingiste ${milestone} XP! Ganhaste 5€ de desconto para uma fatura.`);
  });

  saveState();
  render();
}

function getCurrentLevel(xp) {
  return LEVELS.find((level) => xp >= level.min && xp <= level.max) || LEVELS[LEVELS.length - 1];
}

function getNextLevel(xp) {
  return LEVELS.find((level) => level.min > xp);
}

function getChallengeState(challengeId, month) {
  const key = `${challengeId}-${month}`;
  return state.challengeProgress[key] || null;
}

function setChallengeState(challengeId, month, data) {
  const key = `${challengeId}-${month}`;
  state.challengeProgress[key] = data;
}

function evaluateChallenge(challenge, month) {
  const challengeState = getChallengeState(challenge.id, month);
  if (!challengeState || !challengeState.enrolled || challengeState.rewarded) return;

  if (challenge.id === "peak-reduction") {
    const monthIndex = state.consumptionHistory.findIndex((item) => item.month === month);
    if (monthIndex === -1) return;

    const current = state.consumptionHistory[monthIndex];
    const previous = state.consumptionHistory.find((item) => item.month < month);

    if (!current || !previous || previous.kwh <= 0) return;

    const reductionPercent = ((previous.kwh - current.kwh) / previous.kwh) * 100;

    if (reductionPercent >= 10) {
      challengeState.rewarded = true;
      challengeState.completedAt = new Date().toLocaleString("pt-PT");
      state.claimedChallenges.push(`${challenge.id}-${month}`);
      addXp(challenge.xp, `Desafio mensal: ${challenge.label} (${month})`);
      pushNotification("desconto", `Desafio concluído automaticamente: ${challenge.label}.`);
    }
  }

  if (challenge.id === "saving-tip") {
    const sharesGained = state.shares - (challengeState.baseShareCount || 0);

    if (sharesGained > 0) {
      challengeState.rewarded = true;
      challengeState.completedAt = new Date().toLocaleString("pt-PT");
      state.claimedChallenges.push(`${challenge.id}-${month}`);
      addXp(challenge.xp, `Desafio mensal: ${challenge.label} (${month})`);
      pushNotification("desconto", `Desafio concluído automaticamente: ${challenge.label}.`);
    }
  }
}

function evaluateChallengesForMonth(month) {
  CHALLENGES.forEach((challenge) => {
    evaluateChallenge(challenge, month);
  });
}

function getChallengeButtonText(challengeId, month) {
  const challengeState = getChallengeState(challengeId, month);
  if (!challengeState || !challengeState.enrolled) return "Participar";
  if (challengeState.rewarded) return "Concluído automaticamente";
  return "A verificar...";
}

function renderChallenges() {
  const nowMonth = new Date().toISOString().slice(0, 7);
  evaluateChallengesForMonth(nowMonth);

  document.getElementById("challengeList").innerHTML = CHALLENGES.map((challenge) => {
    const challengeState = getChallengeState(challenge.id, nowMonth);
    const isEnrolled = !!challengeState?.enrolled;
    const isRewarded = !!challengeState?.rewarded;

    return `<article class="challenge-item ${isRewarded ? "done" : ""}">
      <div>
        <h4>${challenge.label}</h4>
        <p>Recompensa: <strong>+${challenge.xp} XP</strong></p>
      </div>
      <button class="btn challenge-btn" data-id="${challenge.id}" ${isRewarded ? "disabled" : ""}>
        ${getChallengeButtonText(challenge.id, nowMonth)}
      </button>
    </article>`;
  }).join("");

  document.querySelectorAll(".challenge-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const challengeId = button.dataset.id;
      const challenge = CHALLENGES.find((item) => item.id === challengeId);
      const month = new Date().toISOString().slice(0, 7);

      if (!challenge) return;

      const currentState = getChallengeState(challengeId, month);
      if (currentState?.rewarded) return;

      if (!currentState?.enrolled) {
        setChallengeState(challengeId, month, {
          enrolled: true,
          rewarded: false,
          enrolledAt: new Date().toLocaleString("pt-PT"),
          baseShareCount: state.shares
        });
        pushNotification("info", `Entraste no desafio mensal: ${challenge.label}. A app vai verificar automaticamente.`);
      }

      evaluateChallengesForMonth(month);
      saveState();
      render();
    });
  });
}

function render() {
  const level = getCurrentLevel(state.xp);
  const nextLevel = getNextLevel(state.xp);

  document.getElementById("xpValue").textContent = `${state.xp} XP`;
  document.getElementById("levelValue").textContent = level.name;

  const percent = Math.min(100, ((state.xp - level.min) / Math.max(1, level.max - level.min)) * 100);
  document.getElementById("xpPercent").textContent = `${Math.round(percent)}%`;
  document.getElementById("xpRing").style.setProperty("--ring-progress", `${percent}%`);

  document.getElementById("nextLevelInfo").textContent = nextLevel
    ? `${Math.max(0, nextLevel.min - state.xp)} XP para chegar a ${nextLevel.name}`
    : "Nível máximo atingido. És uma Lenda Sustentável!";

  document.getElementById("paidInvoicesCount").textContent = state.paidInvoices;
  document.getElementById("sharesCount").textContent = state.shares;
  document.getElementById("monthsCount").textContent = state.consumptionHistory.length;
  document.getElementById("availableDiscounts").textContent = getDiscountsAvailable();

  const totalSavings = state.spendHistory.length * 5;
  document.getElementById("totalSavingsEuro").textContent = `${totalSavings}€`;
  document.getElementById("co2SavedValue").textContent = `${getCo2SavedKg().toFixed(1)} kg`;

  document.getElementById("profileLevel").textContent = level.name;
  document.getElementById("profileXp").textContent = `${state.xp} XP`;

  document.getElementById("consumptionList").innerHTML = state.consumptionHistory.length
    ? state.consumptionHistory
        .map(
          (entry) =>
            `<li><strong>${entry.month}</strong>: ${entry.kwh} kWh (${entry.award > 0 ? `+${entry.award} XP` : "sem XP"})</li>`
        )
        .join("")
    : "<li>Sem consumos registados.</li>";

  document.getElementById("xpHistoryList").innerHTML = state.xpHistory.length
    ? state.xpHistory
        .map((entry) => `<li><strong>${entry.date}</strong> — +${entry.amount} XP <br /><small>${entry.reason}</small></li>`)
        .join("")
    : "<li>Ainda sem ganhos de pontos.</li>";

  document.getElementById("spendHistoryList").innerHTML = state.spendHistory.length
    ? state.spendHistory
        .map(
          (entry) =>
            `<li><strong>${entry.date}</strong> — 5€ na fatura de <strong>${entry.month}</strong><br /><small>${entry.source}</small></li>`
        )
        .join("")
    : "<li>Ainda sem descontos aplicados.</li>";

  document.getElementById("discountHelper").textContent = `Descontos disponíveis: ${getDiscountsAvailable()} de 5€.`;

  document.getElementById("notificationList").innerHTML = state.notifications.length
    ? state.notifications
        .map(
          (entry) => `<li class="notification-item ${entry.type}">
            <div>
              <p>${entry.message}</p>
              <small>${entry.date}</small>
            </div>
          </li>`
        )
        .join("")
    : '<li class="notification-empty">Ainda não tens notificações.</li>';

  document.getElementById("levelsList").innerHTML = LEVELS.map(
    (lvl) => `<li>${lvl.name}: ${lvl.min} a ${lvl.max} XP</li>`
  ).join("");

  renderChallenges();
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");

      document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
      document.getElementById(button.dataset.target).classList.add("active");
    });
  });

  document.getElementById("consumptionForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const month = document.getElementById("monthInput").value;
    const kwh = Number(document.getElementById("kwhInput").value);

    if (!month || Number.isNaN(kwh) || kwh < 0) return;

    let award = 0;
    if (kwh < 200) award = 60;
    else if (kwh < 700) award = 40;
    else if (kwh < 900) award = 20;

    state.consumptionHistory.unshift({ month, kwh, award });
    state.consumptionHistory = state.consumptionHistory.slice(0, 12);

    if (award > 0) {
      addXp(award, `Consumo mensal (${month}) abaixo de ${kwh < 200 ? "200" : kwh < 700 ? "700" : "900"} kWh`);
    } else {
      pushNotification("info", `Consumo ${month} registado sem bónus de XP.`);
      saveState();
      render();
    }

    evaluateChallengesForMonth(month);

    event.target.reset();
  });

  document.getElementById("discountForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const month = document.getElementById("discountMonthInput").value;
    if (!month || getDiscountsAvailable() <= 0) {
      pushNotification("info", "Sem descontos disponíveis neste momento.");
      saveState();
      render();
      return;
    }

    state.spendHistory.unshift({
      date: new Date().toLocaleString("pt-PT"),
      month,
      source: "Desconto de marco de XP"
    });
    state.spendHistory = state.spendHistory.slice(0, 40);

    pushNotification("desconto", `Aplicaste 5€ de desconto na fatura de ${month}.`);
    saveState();
    render();
    event.target.reset();
  });

  document.getElementById("discountForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const month = document.getElementById("discountMonthInput").value;
    if (!month || getDiscountsAvailable() <= 0) {
      pushNotification("info", "Sem descontos disponíveis neste momento.");
      saveState();
      render();
      return;
    }

    state.spendHistory.unshift({
      date: new Date().toLocaleString("pt-PT"),
      month,
      source: "Desconto de marco de XP"
    });
    state.spendHistory = state.spendHistory.slice(0, 40);

    pushNotification("desconto", `Aplicaste 5€ de desconto na fatura de ${month}.`);
    saveState();
    render();
    event.target.reset();
  });

  document.getElementById("payInvoiceBtn").addEventListener("click", () => {
    state.paidInvoices += 1;
    addXp(50, "Pagamento de fatura");
  });

  document.getElementById("shareCodeBtn").addEventListener("click", () => {
    state.shares += 1;
    evaluateChallengesForMonth(new Date().toISOString().slice(0, 7));
    addXp(50, "Partilha de código Goldenergy");
  });
}

bindEvents();
render();
