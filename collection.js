const PERFORMANCE_KEY = "quizGardenPerformance";
const DAILY_GOAL = 10;
const MILESTONE_SIZE = 10;
const $ = (selector) => document.querySelector(selector);

const milestonePlants = [
  { name: "Little Sprout", art: "🌱", detail: "Your first steps" },
  { name: "Daisy", art: "🌼", detail: "A bright new bloom" },
  { name: "Tulip", art: "🌷", detail: "Growing beautifully" },
  { name: "Fern", art: "🌿", detail: "A little more knowledge" },
  { name: "Sunflower", art: "🌻", detail: "Growing toward the light" },
  { name: "Blue Flower", art: "🪻", detail: "A rare garden find" },
  { name: "Cactus", art: "🌵", detail: "Strong and steady" },
  { name: "Cherry Blossom", art: "🌸", detail: "A special achievement" },
  { name: "Four-Leaf Clover", art: "🍀", detail: "A lucky milestone" },
  { name: "Full Bloom", art: "💐", detail: "A flourishing garden" },
  { name: "Golden Flower", art: "🏵️", detail: "A master gardener" },
  { name: "Garden Star", art: "🌺", detail: "A dedicated learner" }
];

const dailyPlants = [
  { name: "Morning Dew", art: "💧" },
  { name: "Pink Bloom", art: "🌸" },
  { name: "Sunny Daffodil", art: "🌼" },
  { name: "Lucky Clover", art: "🍀" },
  { name: "Purple Bellflower", art: "🪻" },
  { name: "Golden Sunflower", art: "🌻" }
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(PERFORMANCE_KEY) || "[]");
    return Array.isArray(records) ? records.filter(record => record && record.date && record.question) : [];
  } catch (error) {
    console.error("Could not load collection progress:", error);
    return [];
  }
}

function renderCollection() {
  const records = readRecords();
  const today = localDateKey();
  const todayCount = records.filter(record => record.date === today).length;
  const totalCount = records.length;
  const questionsByDay = new Map();
  records.forEach(record => questionsByDay.set(record.date, (questionsByDay.get(record.date) || 0) + 1));
  const goalDays = [...questionsByDay.entries()]
    .filter(([, count]) => count >= DAILY_GOAL)
    .map(([date]) => date)
    .sort();
  const milestoneCount = Math.min(Math.floor(totalCount / MILESTONE_SIZE), milestonePlants.length);
  const dailyCount = goalDays.length;

  $("#completedCount").textContent = totalCount;
  $("#plantCount").textContent = milestoneCount + dailyCount;
  $("#goalCount").textContent = dailyCount;
  $("#goalStatus").textContent = `${Math.min(todayCount, DAILY_GOAL)} / ${DAILY_GOAL}`;
  $("#goalBar").style.width = `${Math.min((todayCount / DAILY_GOAL) * 100, 100)}%`;
  $("#goalProgress").setAttribute("aria-valuenow", String(Math.min(todayCount, DAILY_GOAL)));
  $("#goalMessage").textContent = todayCount >= DAILY_GOAL
    ? "Daily goal reached! You earned today's reward plant. Come back tomorrow for another!"
    : `${DAILY_GOAL - todayCount} more ${DAILY_GOAL - todayCount === 1 ? "question" : "questions"} to earn today's reward plant.`;

  renderMilestones(milestoneCount, totalCount);
  renderDailyRewards(goalDays);
}

function renderMilestones(unlockedCount, totalCount) {
  $("#plantGrid").innerHTML = milestonePlants.map((plant, index) => {
    const milestone = (index + 1) * MILESTONE_SIZE;
    const unlocked = index < unlockedCount;
    const progress = Math.min(totalCount, milestone);
    return `<article class="plant-card ${unlocked ? "unlocked" : "locked"}">
      <div class="plant-art" aria-hidden="true">${unlocked ? plant.art : "🔒"}</div>
      <div class="plant-name">${escapeHTML(plant.name)}</div>
      <div class="plant-detail">${escapeHTML(plant.detail)}</div>
      <div class="plant-status">${unlocked ? "Collected!" : `${milestone} questions to unlock`}</div>
    </article>`;
  }).join("");
}

function renderDailyRewards(goalDays) {
  if (!goalDays.length) {
    $("#dailyRewards").innerHTML = `<div class="empty-rewards">Your first daily reward will appear here when you complete 10 questions in one day.</div>`;
    return;
  }
  const earnedRewards = goalDays.map((date, index) => ({ date, plant: dailyPlants[index % dailyPlants.length] }));
  $("#dailyRewards").innerHTML = earnedRewards.reverse().map(({ date, plant }) => {
    const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `<article class="daily-reward"><div class="plant-art" aria-hidden="true">${plant.art}</div><div><strong>${escapeHTML(plant.name)}</strong><small>Earned ${escapeHTML(dateLabel)}</small></div></article>`;
  }).join("");
}

renderCollection();
window.addEventListener("storage", event => {
  if (event.key === PERFORMANCE_KEY) renderCollection();
});
