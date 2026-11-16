const BANK_KEY = "quizGardenQuestionBank";
const API_URL = "https://quiz-generator.akiraevanson.workers.dev/";

const $ = (selector) => document.querySelector(selector);
let bank = loadBank();
let activeSetId = null;

function loadBank() {
  try {
    const saved = JSON.parse(localStorage.getItem(BANK_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error("Could not read the saved question bank:", error);
    return [];
  }
}

function saveBank() {
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(bank));
    return true;
  } catch (error) {
    console.error(error);
    setStatus("Your browser storage is full. Export your bank or remove some sets.", true);
    return false;
  }
}

function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function setStatus(message, isError = false) {
  const status = $("#qbStatus");
  status.textContent = message;
  status.style.color = isError ? "#a33131" : "#356b49";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function getSet(id) {
  return bank.find((set) => set.id === id);
}

function renderSets() {
  const query = $("#searchSets").value.trim().toLowerCase();
  const visibleSets = bank.filter((set) =>
    `${set.title} ${set.subject || ""}`.toLowerCase().includes(query)
  );

  $("#setCount").textContent = `${bank.length} ${bank.length === 1 ? "study set" : "study sets"}`;
  $("#emptyMessage").hidden = visibleSets.length > 0;

  $("#setsList").innerHTML = visibleSets.map((set) => `
    <article class="qb-set-card">
      <h3>${escapeHTML(set.title)}</h3>
      <p>${escapeHTML(set.subject || "Uncategorized")}</p>
      <p>${set.questions.length} ${set.questions.length === 1 ? "question" : "questions"}</p>
      <p>Updated ${new Date(set.updatedAt).toLocaleDateString()}</p>
      <div class="qb-set-actions">
        <button class="qb-button primary" data-action="study" data-id="${escapeHTML(set.id)}" ${set.questions.length < 4 ? "disabled title='Add at least four questions to play'" : ""}>Play</button>
        <button class="qb-button secondary" data-action="edit" data-id="${escapeHTML(set.id)}">Edit</button>
        <button class="qb-button secondary" data-action="delete" data-id="${escapeHTML(set.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function createSet(title, subject = "", questions = []) {
  const now = new Date().toISOString();
  const set = {
    id: makeId(),
    title: title.trim(),
    subject: subject.trim(),
    createdAt: now,
    updatedAt: now,
    questions: questions.map((item) => ({
      id: makeId(),
      q: String(item.q || "").trim(),
      a: String(item.a || "").trim(),
      flagged: false
    })).filter((item) => item.q && item.a)
  };
  bank.unshift(set);
  if (saveBank()) {
    renderSets();
    openEditor(set.id);
    return set;
  }
  bank = bank.filter((item) => item.id !== set.id);
  return null;
}

$("#createSetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#setTitle").value.trim();
  if (!title) return;
  const set = createSet(title, $("#setSubject").value);
  if (set) {
    $("#setTitle").value = "";
    $("#setSubject").value = "";
    setStatus("Your new question set is ready. Add your first questions below!");
  }
});

$("#generateButton").addEventListener("click", async () => {
  const notes = $("#studyNotes").value.trim();
  const title = $("#setTitle").value.trim();
  const subject = $("#setSubject").value.trim();
  const count = Number($("#questionCount").value);

  if (notes.length < 80) {
    setStatus("Please enter at least 80 characters of study notes.", true);
    $("#studyNotes").focus();
    return;
  }
  if (!title) {
    setStatus("Give your new question set a title first.", true);
    $("#setTitle").focus();
    return;
  }
  if (!API_URL) {
    setStatus("The AI connection is not configured yet. Add your Cloudflare Worker URL in question-bank.js.", true);
    return;
  }

  const button = $("#generateButton");
  button.disabled = true;
  button.textContent = "Growing questions...";
  setStatus("Sending your notes to the question generator...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    });

    const data = await response.json();
    const pairs = (data.pairs || [])
      .filter((pair) => pair && pair.q && pair.a)
      .slice(0, count);

    if (!response.ok || pairs.length < 4) {
      throw new Error(data.error || "The generator returned fewer than four valid questions.");
    }

    const set = createSet(title, subject, pairs);
    if (set) {
      $("#studyNotes").value = "";
      $("#setTitle").value = "";
      $("#setSubject").value = "";
      setStatus(`Saved "${set.title}" with ${set.questions.length} questions!`);
    }
  } catch (error) {
    console.error(error);
    setStatus("Couldn't generate questions. Check your Worker connection and try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "✨ Generate & save";
  }
});

$("#setsList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const set = getSet(button.dataset.id);
  if (!set) return;

  if (button.dataset.action === "edit") openEditor(set.id);
  if (button.dataset.action === "study") {
    if (set.questions.length < 4) {
      setStatus("Add at least four questions before playing this set.", true);
      return;
    }
    localStorage.setItem("quizGardenSelectedSet", set.id);
    window.location.href = `game.html?set=${encodeURIComponent(set.id)}`;
  }
  if (button.dataset.action === "delete") {
    if (!confirm(`Delete "${set.title}" and all of its questions? This cannot be undone.`)) return;
    bank = bank.filter((item) => item.id !== set.id);
    saveBank();
    renderSets();
    if (activeSetId === set.id) closeEditor();
    setStatus(`Deleted "${set.title}".`);
  }
});

$("#searchSets").addEventListener("input", renderSets);

function openEditor(id) {
  const set = getSet(id);
  if (!set) return;
  activeSetId = id;
  $("#editorPanel").hidden = false;
  $("#editorTitle").textContent = set.title;
  $("#editorSubtitle").textContent = `${set.questions.length} questions`;
  $("#editSetTitle").value = set.title;
  $("#editSetSubject").value = set.subject || "";
  renderQuestions();
  $("#editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  activeSetId = null;
  $("#editorPanel").hidden = true;
}

$("#closeEditor").addEventListener("click", closeEditor);

function renderQuestions() {
  const set = getSet(activeSetId);
  if (!set) return;
  $("#editorSubtitle").textContent = `${set.questions.length} questions`;
  $("#questionList").innerHTML = set.questions.length ? set.questions.map((question, index) => `
    <article class="qb-question-card ${question.flagged ? "flagged" : ""}">
      <div class="qb-question-top">
        <strong>${index + 1}. ${escapeHTML(question.q)}</strong>
        ${question.flagged ? '<span title="Flagged for review">⚑</span>' : ""}
      </div>
      <p class="qb-answer-text"><b>Answer:</b> ${escapeHTML(question.a)}</p>
      <div class="qb-question-actions">
        <button class="qb-button secondary" data-question-action="edit" data-id="${escapeHTML(question.id)}">Edit</button>
        <button class="qb-button secondary" data-question-action="flag" data-id="${escapeHTML(question.id)}">${question.flagged ? "Unflag" : "Flag for review"}</button>
        <button class="qb-button secondary" data-question-action="delete" data-id="${escapeHTML(question.id)}">Delete</button>
      </div>
    </article>
  `).join("") : '<p class="qb-empty">No questions yet. Add one below or generate questions from your notes.</p>';
}

$("#saveSetDetails").addEventListener("click", () => {
  const set = getSet(activeSetId);
  if (!set) return;
  const title = $("#editSetTitle").value.trim();
  if (!title) {
    alert("A question set needs a title.");
    return;
  }
  set.title = title;
  set.subject = $("#editSetSubject").value.trim();
  set.updatedAt = new Date().toISOString();
  saveBank();
  renderSets();
  $("#editorTitle").textContent = set.title;
  setStatus("Set details saved.");
});

$("#addQuestionButton").addEventListener("click", () => {
  const set = getSet(activeSetId);
  const q = $("#newQuestion").value.trim();
  const a = $("#newAnswer").value.trim();
  if (!set) return;
  if (!q || !a) {
    alert("Enter both a question and an answer.");
    return;
  }
  set.questions.push({ id: makeId(), q, a, flagged: false });
  set.updatedAt = new Date().toISOString();
  if (saveBank()) {
    $("#newQuestion").value = "";
    $("#newAnswer").value = "";
    renderQuestions();
    renderSets();
    setStatus("Question added!");
  }
});

$("#questionList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-question-action]");
  if (!button) return;
  const set = getSet(activeSetId);
  if (!set) return;
  const question = set.questions.find((item) => item.id === button.dataset.id);
  if (!question) return;

  const action = button.dataset.questionAction;
  if (action === "edit") {
    const newQ = prompt("Edit question:", question.q);
    if (newQ === null) return;
    const newA = prompt("Edit answer:", question.a);
    if (newA === null) return;
    if (!newQ.trim() || !newA.trim()) {
      alert("Question and answer cannot be empty.");
      return;
    }
    question.q = newQ.trim();
    question.a = newA.trim();
  } else if (action === "flag") {
    question.flagged = !question.flagged;
  } else if (action === "delete") {
    if (!confirm("Delete this question?")) return;
    set.questions = set.questions.filter((item) => item.id !== question.id);
  }

  set.updatedAt = new Date().toISOString();
  saveBank();
  renderQuestions();
  renderSets();
});

$("#exportButton").addEventListener("click", () => {
  const file = new Blob([JSON.stringify({ app: "QuizGarden", version: 1, sets: bank }, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quizgarden-question-bank.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Your question bank has been exported.");
});

$("#importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    const incomingSets = Array.isArray(imported) ? imported : imported.sets;
    if (!Array.isArray(incomingSets)) throw new Error("Invalid question bank file.");

    const cleaned = incomingSets.map((set) => ({
      id: makeId(),
      title: String(set.title || "Imported study set").slice(0, 70),
      subject: String(set.subject || "").slice(0, 40),
      createdAt: set.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: (Array.isArray(set.questions) ? set.questions : [])
        .filter((q) => q && q.q && q.a)
        .map((q) => ({ id: makeId(), q: String(q.q), a: String(q.a), flagged: Boolean(q.flagged) }))
    }));

    bank = [...cleaned, ...bank];
    if (!saveBank()) throw new Error("Could not save the imported sets.");
    renderSets();
    setStatus(`Imported ${cleaned.length} question sets.`);
  } catch (error) {
    console.error(error);
    setStatus("That file could not be imported. Please choose a QuizGarden JSON backup.", true);
  } finally {
    event.target.value = "";
  }
});

renderSets();
