const PERFORMANCE_KEY = "quizGardenPerformance";
const $ = (selector) => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readPerformance() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERFORMANCE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(item => item && item.date && item.question) : [];
  } catch (error) {
    console.error("Could not read Daily Review data:", error);
    return [];
  }
}

function formatDate(dateKey) {
  if (!dateKey) return "Unknown date";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
}

function showEmpty(message, detail) {
  return `<div class="empty-state"><strong>${escapeHTML(message)}</strong>${escapeHTML(detail)}</div>`;
}

function topicName(record) {
  const subject = String(record.subject || "").trim();
  if (subject && subject.toLowerCase() !== "uncategorized") return subject;
  return String(record.setTitle || "Uncategorized").trim() || "Uncategorized";
}

function renderReview() {
  const allRecords = readPerformance();
  const selectedDate = $("#reviewDate").value || localDateKey();
  const records = allRecords.filter(item => item.date === selectedDate);
  const total = records.length;
  const firstTry = records.filter(item => Number(item.attempts) === 1).length;
  const multiple = records.filter(item => Number(item.attempts) > 1).length;
  const accuracy = total ? Math.round((firstTry / total) * 100) : 0;

  $("#totalCount").textContent = total;
  $("#firstTryCount").textContent = firstTry;
  $("#multipleCount").textContent = multiple;
  $("#accuracyRate").textContent = total ? `${accuracy}%` : "—";
  $("#accuracyBar").style.width = `${accuracy}%`;
  $("#accuracyProgress").setAttribute("aria-valuenow", String(accuracy));
  $("#performanceLabel").textContent = total ? `${accuracy}% first-try accuracy` : "No data yet";
  $("#accuracyCaption").textContent = total
    ? `${firstTry} of ${total} completed questions were correct on the first try.`
    : "Complete a question in Garden Match to begin tracking.";

  renderTopics(records);
  renderDifficultQuestions(records);
  renderHistory(allRecords, selectedDate);
}

function renderTopics(records) {
  const groups = new Map();
  records.forEach(record => {
    const name = topicName(record);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  });

  const topics = [...groups.entries()].map(([name, items]) => {
    const firstTry = items.filter(item => Number(item.attempts) === 1).length;
    const struggled = items.filter(item => Number(item.attempts) > 1).length;
    const accuracy = Math.round((firstTry / items.length) * 100);
    let status = "Strong first-try results";
    let statusClass = "good";
    if (struggled > 0 && struggled >= firstTry) {
      status = "Needs more practice";
      statusClass = "warn";
    } else if (struggled > 0) {
      status = "Some questions to revisit";
      statusClass = "warn";
    }
    return { name, total: items.length, firstTry, struggled, accuracy, status, statusClass };
  }).sort((a, b) => b.struggled - a.struggled || a.accuracy - b.accuracy);

  $("#topicList").innerHTML = topics.length ? topics.map(topic => `
    <article class="topic-card">
      <div class="topic-top">
        <div><div class="topic-name">${escapeHTML(topic.name)}</div>
          <div class="topic-meta">${topic.total} completed · ${topic.struggled} needed multiple attempts · ${topic.firstTry} correct first try</div>
        </div>
        <span class="status-pill ${topic.statusClass}">${escapeHTML(topic.status)}</span>
      </div>
      <div class="topic-bar" aria-label="${topic.accuracy}% first-try accuracy"><span style="width:${topic.accuracy}%"></span></div>
    </article>
  `).join("") : showEmpty("No topic data for this day yet.", "Play Garden Match using a saved set to see subject-level summaries here.");
}

function renderDifficultQuestions(records) {
  const difficult = records.filter(item => Number(item.attempts) > 1)
    .sort((a, b) => Number(b.attempts) - Number(a.attempts));

  $("#difficultList").innerHTML = difficult.length ? difficult.map(item => `
    <article class="question-card">
      <div class="question-top">
        <div class="question-text">${escapeHTML(item.question)}</div>
        <span class="attempt-pill">${Number(item.attempts)} attempts</span>
      </div>
      <p class="question-answer"><strong>Correct answer:</strong> ${escapeHTML(item.answer)}</p>
      <p class="question-source">${escapeHTML(topicName(item))} · ${escapeHTML(item.setTitle || item.source || "Garden Match")}</p>
    </article>
  `).join("") : showEmpty("No difficult questions recorded.", records.length ? "You answered every completed question correctly on the first try. Nice work!" : "Questions that take more than one attempt will appear here.");
}

function renderHistory(allRecords, selectedDate) {
  const dates = [...new Set(allRecords.map(item => item.date))].sort((a, b) => b.localeCompare(a));
  $("#historyList").innerHTML = dates.length ? dates.map(date => {
    const items = allRecords.filter(item => item.date === date);
    const first = items.filter(item => Number(item.attempts) === 1).length;
    const percent = Math.round((first / items.length) * 100);
    return `<button class="history-card" type="button" data-date="${escapeHTML(date)}" ${date === selectedDate ? 'aria-current="date"' : ""}>
      <span><span class="history-date">${escapeHTML(formatDate(date))}</span><br><span class="history-meta">${items.length} questions completed · ${percent}% first-try accuracy</span></span>
      <span class="status-pill ${percent >= 70 ? "good" : "warn"}">${percent}%</span>
    </button>`;
  }).join("") : showEmpty("Your review history will grow here.", "Complete questions in Garden Match and your daily summaries will be saved automatically.");
}

const dateInput = $("#reviewDate");
dateInput.value = localDateKey();
dateInput.max = localDateKey();
dateInput.addEventListener("change", renderReview);
$("#historyList").addEventListener("click", event => {
  const button = event.target.closest("button[data-date]");
  if (!button) return;
  dateInput.value = button.dataset.date;
  renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

renderReview();
