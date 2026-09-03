import { renderDashboard } from "./dashboard.js";
import { parseIEP, normalizeParsedStudent, sanitizePlanText, Student, placeholderEncryptedStorage } from "./parser.js";
import { educationalTools, recommendTools, generateLesson } from "./toolMatcher.js";
import { generateAAC, materialToMarkdown } from "./aacGenerator.js";
import { suggestedQuestions, teacherCoach, renderMarkdown } from "./chatbot.js";
import { createProgressEntry, summarizeProgress, generateParentReport } from "./evaluation.js";

const routes = [
  ["dashboard", "PN", "Paneli"],
  ["students", "NX", "Profilet e nxënësve"],
  ["upload", "PI", "Ngarko PIA"],
  ["tools", "MJ", "Paketa e mësimdhënies"],
  ["schedules", "OR", "Orari"],
  ["boards", "TK", "Tabela komunikimi"],
  ["progress", "PR", "Ndjekja e progresit"],
  ["reports", "RP", "Raporte për prindër"],
  ["coach", "AI", "Atlas - trajneri AI"],
  ["settings", "CI", "Cilësimet"]
];

const state = {
  route: "dashboard",
  students: [],
  currentStudent: null,
  studentProfileOpen: false,
  reportPreviewOpen: false,
  activity: [],
  recommendations: [],
  savedTools: new Set(),
  favoriteTools: new Set(),
  compareTools: new Set(),
  progressEntries: [],
  progressByStudent: {},
  progressSummary: summarizeProgress([]),
  chatMessages: [],
  completedGoals: new Set(),
  lastMaterial: null,
  selectedMood: "I/e qetë",
  scheduleDay: 0,
  scheduleWeekOffset: 0,
  scheduleByStudent: {},
  theme: "light"
};

const scheduleDays = ["E hënë", "E martë", "E mërkurë", "E enjte", "E premte"];

function createInitialSchedule() {
  const activities = [
    ["Mirëseardhja", "Lexim", "Matematikë", "Pushim", "Art dhe krijimtari"],
    ["Rrethi i mëngjesit", "Gjuhë shqipe", "Shkencë", "Pushim", "Lojë e udhëhequr"],
    ["Mirëseardhja", "Matematikë", "Lexim", "Pushim", "Muzikë"],
    ["Rrethi i mëngjesit", "Shkencë", "Gjuhë shqipe", "Pushim", "Punë në grup"],
    ["Planifikimi i ditës", "Lexim", "Matematikë", "Pushim", "Reflektim javor"]
  ];
  const times = [["08:00", "08:45"], ["08:45", "09:30"], ["09:45", "10:30"], ["10:30", "11:00"], ["11:00", "11:45"]];
  return activities.map((day, dayIndex) => day.map((activity, slotIndex) => ({
    id: `${dayIndex}-${slotIndex}`,
    start: times[slotIndex][0],
    end: times[slotIndex][1],
    activity,
    goal: "",
    completed: false
  })));
}

const root = document.getElementById("viewRoot");
const navList = document.getElementById("navList");
const pageTitle = document.getElementById("pageTitle");
const sidebar = document.getElementById("sidebar");
const searchInput = document.getElementById("globalSearch");
const searchResults = document.getElementById("searchResults");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalEyebrow = document.getElementById("modalEyebrow");
const modalBody = document.getElementById("modalBody");
const toastRegion = document.getElementById("toastRegion");
const apiKeyGate = document.getElementById("apiKeyGate");
const apiKeyForm = document.getElementById("apiKeyForm");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyError = document.getElementById("apiKeyError");
const privacyConsent = document.getElementById("privacyConsent");
const privacyPolicyLink = document.getElementById("privacyPolicyLink");
const privacyStickerBackdrop = document.getElementById("privacyStickerBackdrop");
const privacyStickerClose = document.getElementById("privacyStickerClose");
const privacyStickerAccept = document.getElementById("privacyStickerAccept");
const openAppButton = document.getElementById("openAppButton");
let openAIApiKey = "";

apiKeyForm.addEventListener("submit", handleApiKeySubmit);
privacyConsent.addEventListener("change", () => {
  openAppButton.disabled = !privacyConsent.checked;
});
privacyPolicyLink.addEventListener("click", openPrivacySticker);
privacyStickerClose.addEventListener("click", closePrivacySticker);
privacyStickerAccept.addEventListener("click", closePrivacySticker);
privacyStickerBackdrop.addEventListener("click", (event) => {
  if (event.target === privacyStickerBackdrop) closePrivacySticker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !privacyStickerBackdrop.classList.contains("hidden")) closePrivacySticker();
});
apiKeyInput.focus();

function openPrivacySticker(event) {
  event.preventDefault();
  event.stopPropagation();
  privacyStickerBackdrop.classList.remove("hidden");
  privacyStickerClose.focus();
}

function closePrivacySticker() {
  privacyStickerBackdrop.classList.add("hidden");
  privacyPolicyLink.focus();
}

function handleApiKeySubmit(event) {
  event.preventDefault();
  const key = apiKeyInput.value.trim();

  if (!privacyConsent.checked) return;

  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    apiKeyError.classList.remove("hidden");
    apiKeyInput.focus();
    return;
  }

  openAIApiKey = key;
  apiKeyInput.value = "";
  apiKeyError.classList.add("hidden");
  apiKeyGate.classList.add("hidden");
  document.querySelector(".app-shell").removeAttribute("inert");
  document.querySelector(".atlas-guide-widget").removeAttribute("inert");
  init();
}

async function init() {
  renderNavigation();
  const sample = await loadSampleStudent();
  state.students = createPrivacySafeStudents(sample);
  state.currentStudent = state.students[0];
  state.scheduleByStudent = Object.fromEntries(state.students.map((student) => [student.id, createInitialSchedule()]));
  seedProgress();
  state.progressByStudent = Object.fromEntries(state.students.map((student, index) => [student.id, index === 0 ? state.progressEntries : []]));
  refreshDerivedState();
  state.activity = [
    { title: "Profili shembull u ngarkua", detail: `Plani mbështetës për ${state.currentStudent.name} është gati.` },
    { title: "Ndjekja e progresit është aktive", detail: "Janë gati tri vëzhgime shembull." }
  ];
  state.chatMessages = [
    {
      role: "ai",
      text: `Përshëndetje, jam Atlas, asistenti yt për PIA. Mund të ndihmoj që objektivat e ${state.currentStudent.name} të kthehen në rutina, mbështetje AAC, strategji mësimore dhe gjuhë të kuptueshme për familjen.`,
      time: new Date()
    }
  ];
  bindGlobalEvents();
  navigate("dashboard");
}

async function loadSampleStudent() {
  try {
    const response = await fetch("data/sampleIEP.json");
    if (!response.ok) throw new Error("Sample unavailable");
    return await response.json();
  } catch {
    return {
      studentName: "Maya Johnson",
      age: 8,
      diagnosis: "Çrregullim i spektrit të autizmit me nevoja për përpunim shqisor",
      communicationAbilities: "Përdor fraza të shkurtra, zgjedhje me figura dhe përgjigje po/jo.",
      fineMotorGoals: ["Të shkruajë emrin me formim më të qëndrueshëm të shkronjave"],
      grossMotorGoals: ["Të ndjekë një rutinë lëvizjeje me tre hapa"],
      speechGoals: ["Të përdorë një kërkesë me pesë fjalë me mbështetje vizuale"],
      sensoryNeeds: ["Ulja e zhurmës", "Pushime për lëvizje", "Qasje në kënd qetësie"],
      behaviorTriggers: ["Kalime me zhurmë", "Ndryshime të papritura të orarit"],
      preferredReinforcers: ["Zgjedhje ngjitësesh", "Kohë për vizatim"],
      immediateObjectives: ["Të kërkojë pushim me kartë me figurë"],
      longTermObjectives: ["Të përdorë orarin vizual gjatë ditës shkollore"],
      strengths: ["Kujtesë e fortë vizuale", "I/e pëlqen të ndihmojë shokët"],
      challenges: ["Vështirësi në ambiente me zhurmë"]
    };
  }
}

function seedProgress() {
  state.progressEntries = [
    createProgressEntry({ date: "2026-07-08", goal: "Përdor orarin vizual", result: "Kontrolloi orarin pas një kujtese të shkurtër." }),
    createProgressEntry({ date: "2026-07-09", goal: "Kërkon pushim", result: "Përdori kartën e pushimit në mënyrë të pavarur." }),
    createProgressEntry({ date: "2026-07-10", goal: "Sekuenca e larjes së duarve", result: "Përfundoi hapat e sapunit dhe shpëlarjes pa ndihmë." })
  ];
}

function refreshDerivedState() {
  state.progressSummary = summarizeProgress(state.progressEntries);
  state.recommendations = recommendTools(state.currentStudent);
}

function renderNavigation() {
  navList.innerHTML = routes
    .map(([id, icon, label]) => `<button class="nav-button" data-route="${id}" aria-current="${id === state.route ? "page" : "false"}"><span aria-hidden="true">${icon}</span><span>${label}</span></button>`)
    .join("");
}

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("dragstart", handleScheduleDragStart);
  document.addEventListener("dragover", handleScheduleDragOver);
  document.addEventListener("dragleave", handleScheduleDragLeave);
  document.addEventListener("drop", handleScheduleDrop);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("[data-dashboard-goal]")) {
      event.preventDefault();
      event.target.blur();
    }
    if (event.key === "Escape") closeModal();
  });
  searchInput.addEventListener("input", handleSearch);
}

function handleClick(event) {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    navigate(routeButton.dataset.route);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, toolId, goalIndex, studentId, dayIndex, slotId } = actionButton.dataset;

  const actions = {
    "toggle-sidebar": () => sidebar.classList.toggle("open"),
    "toggle-theme": toggleTheme,
    "toggle-dashboard-goal": () => toggleDashboardGoal(Number(goalIndex)),
    "open-student-profile": () => showStudentProfile(studentId),
    "back-student-list": showStudentList,
    "open-add-student": openAddStudentModal,
    "open-report-preview": () => openReportPreview(studentId),
    "back-report-list": showReportList,
    "schedule-day": () => selectScheduleDay(Number(dayIndex)),
    "schedule-student": () => selectScheduleStudent(studentId),
    "schedule-next-week": nextScheduleWeek,
    "toggle-slot-complete": () => toggleScheduleSlot(slotId),
    "edit-schedule-slot": () => openScheduleSlotEditor(slotId),
    "close-modal": closeModal,
    "parse-plan": parsePlanFromInputs,
    "tool-details": () => showToolDetails(toolId),
    "save-tool": () => toggleSet(state.savedTools, toolId, "U ruajt në paketën e mjeteve", "U hoq nga mjetet e ruajtura"),
    "favorite-tool": () => toggleSet(state.favoriteTools, toolId, "U shtua te të preferuarat", "U hoq nga të preferuarat"),
    "compare-tool": () => toggleCompare(toolId),
    "lesson-tool": () => showLesson(toolId),
    "video-tool": () => showVideoPlaceholder(toolId),
    "generate-aac": generateAACFromInput,
    "copy-material": copyMaterial,
    "print-view": () => window.print(),
    "download-report-pdf": printReportAsPdf,
    "download-placeholder": () => toast("Eksporti PDF është gati si funksion provë për integrim të ardhshëm."),
    "edit-material": enableMaterialEditing,
    "regenerate-material": generateAACFromInput,
    "suggestion": () => sendCoachMessage(actionButton.textContent.trim()),
    "send-chat": () => sendCoachMessage(document.getElementById("chatInput")?.value || ""),
    "mood": () => selectMood(actionButton),
    "generate-report": renderParentReport,
    "backup-placeholder": () => toast(placeholderEncryptedStorage().message),
    "clear-memory": clearMemory
  };

  actions[action]?.();
}

function toggleDashboardGoal(index) {
  if (state.completedGoals.has(index)) {
    state.completedGoals.delete(index);
  } else {
    state.completedGoals.add(index);
  }
  navigate("dashboard");
}

function showStudentProfile(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;
  activateStudent(student);
  state.studentProfileOpen = true;
  refreshDerivedState();
  navigate("students", { keepStudentProfile: true });
}

function getStudentProgress(studentId) {
  if (!state.progressByStudent[studentId]) state.progressByStudent[studentId] = [];
  return state.progressByStudent[studentId];
}

function activateStudent(student) {
  state.currentStudent = student;
  state.progressEntries = getStudentProgress(student.id);
  refreshDerivedState();
}

function openReportPreview(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;
  activateStudent(student);
  state.reportPreviewOpen = true;
  navigate("reports", { keepReportPreview: true });
}

function showReportList() {
  state.reportPreviewOpen = false;
  navigate("reports");
}

function printReportAsPdf() {
  toast("Zgjidhni 'Ruaj si PDF' në dritaren e printimit.");
  window.print();
}

function showStudentList() {
  state.studentProfileOpen = false;
  navigate("students");
}

function createPrivacySafeStudents(sample) {
  const shared = { ...sample, diagnosis: "Profil mësimor", studentName: undefined };

  return [
    new Student({ ...shared, nickname: "Ylli i Vogël", initials: "M.J.", age: 8, birthday: "14 mars", animal: "bear", learningStyle: "Përfiton nga mbështetja vizuale, frazat e shkurtra dhe rutinat e qarta." }),
    new Student({ ...shared, nickname: "Luani Kureshtar", initials: "A.K.", age: 9, birthday: "2 korrik", animal: "lion", learningStyle: "Mëson mirë përmes shembujve praktikë, zgjedhjeve dhe lëvizjes së shkurtër.", immediateObjectives: ["Të ndjekë një udhëzim me dy hapa", "Të kërkojë ndihmë me një frazë të shkurtër"] }),
    new Student({ ...shared, nickname: "Lepurushja e Qetë", initials: "E.R.", age: 7, birthday: "21 shtator", animal: "rabbit", learningStyle: "Përfiton nga ritmi i qetë, koha për përgjigje dhe materialet me figura.", immediateObjectives: ["Të zgjedhë mes dy aktiviteteve", "Të përfundojë rutinën e mëngjesit", "Të përdorë kartën e pushimit"] }),
    new Student({ ...shared, nickname: "Dhelpra Krijuese", initials: "L.B.", age: 10, birthday: "8 dhjetor", animal: "fox", learningStyle: "Angazhohet më shumë me tregime, vizatim dhe detyra të ndara në hapa të vegjël.", immediateObjectives: ["Të organizojë materialet para aktivitetit", "Të përdorë orarin vizual pa kujtesë"] })
  ];
}

function handleSubmit(event) {
  event.preventDefault();
  if (event.target.id === "scheduleSlotForm") {
    saveScheduleSlot(new FormData(event.target));
  }
  if (event.target.id === "addStudentForm") {
    addStudentProfile(new FormData(event.target));
  }
  if (event.target.id === "chatForm") {
    sendCoachMessage(document.getElementById("chatInput").value);
  }
  if (event.target.id === "progressForm") {
    addProgressEntry(new FormData(event.target));
  }
}

function handleInput(event) {
  if (event.target.matches("[data-dashboard-goal]")) {
    const index = Number(event.target.dataset.dashboardGoal);
    state.currentStudent.immediateObjectives[index] = event.target.textContent.trim();
    return;
  }

  if (event.target.matches("input[type='range']")) {
    event.target.nextElementSibling.textContent = `${event.target.value}%`;
  }
}

function handleChange(event) {
  if (event.target.id === "fileUpload") {
    const file = event.target.files[0];
    if (file) readPlanFile(file);
  }
}

function navigate(route, options = {}) {
  if (route === "students" && !options.keepStudentProfile) state.studentProfileOpen = false;
  if (route === "reports" && !options.keepReportPreview) state.reportPreviewOpen = false;
  state.route = route;
  sidebar.classList.remove("open");
  renderNavigation();
  const routeLabel = routes.find(([id]) => id === route)?.[2] || "Paneli";
  pageTitle.textContent = routeLabel;
  root.innerHTML = renderRoute(route);
  root.classList.remove("fade-in");
  requestAnimationFrame(() => root.classList.add("fade-in"));
  attachRouteBehaviors(route);
  document.getElementById("mainContent").focus({ preventScroll: true });
}

function renderRoute(route) {
  refreshDerivedState();
  const renderers = {
    dashboard: () => renderDashboard(state),
    students: renderStudents,
    upload: renderUpload,
    tools: () => renderTools("Paketa e mësimdhënies", educationalTools),
    schedules: renderSchedule,
    boards: renderCommunicationBoards,
    progress: renderProgress,
    reports: renderReports,
    coach: renderCoach,
    settings: renderSettings
  };
  return renderers[route]?.() || renderDashboard(state);
}

function attachRouteBehaviors(route) {
  if (route === "upload") attachUploadZone();
  if (route === "coach") scrollChatToBottom();
  if (route === "boards") attachCommunicationModuleApi();
}

function attachCommunicationModuleApi() {
  const frame = document.querySelector(".communication-module-frame");
  if (!frame) return;

  try {
    const moduleTemplate = document.getElementById("communicationModuleTemplate");
    if (!moduleTemplate) throw new Error("Communication module unavailable");

    const moduleHtml = `<!doctype html><html lang="sq"><head><meta charset="UTF-8"></head><body>${moduleTemplate.innerHTML}</body></html>`;
    const apiKeyDeclaration = /const\s+OPENAI_API_KEY\s*=\s*(?:"VENDOS_API_KEY_KETU"|"")\s*;/;
    if (!apiKeyDeclaration.test(moduleHtml)) throw new Error("API key declaration unavailable");

    frame.srcdoc = moduleHtml.replace(
      apiKeyDeclaration,
      `const OPENAI_API_KEY = ${JSON.stringify(openAIApiKey)};`
    );
  } catch (error) {
    console.error(error);
    frame.replaceWith(Object.assign(document.createElement("p"), {
      className: "glass-card",
      textContent: "Tabela e komunikimit nuk mund të ngarkohet. Rifreskoni faqen dhe provoni përsëri."
    }));
  }
}

function renderStudents() {
  if (!state.studentProfileOpen) return renderStudentList();

  const student = state.currentStudent;
  return `
    <button class="student-back-button" type="button" data-action="back-student-list">← Kthehu te lista</button>
    <section class="glass-card profile-top private-profile-header">
      <div class="animal-avatar animal-avatar-large" aria-hidden="true">${animalIcon(student.animal)}</div>
      <div class="private-profile-copy">
        <p class="eyebrow">Profil privat i nxënësit</p>
        <h2>${student.nickname} <span>${student.initials}</span></h2>
        <p>${student.learningStyle}</p>
        <div class="badge-row">
          <span class="badge">Mosha: ${student.age} vjeç</span>
          <span class="badge">Ditëlindja: ${student.birthday}</span>
          <span class="badge">Objektiva aktuale: ${student.immediateObjectives.length}</span>
        </div>
      </div>
    </section>
    <section class="profile-grid">
      ${profileCard("Pikat e forta", student.strengths)}
      ${profileCard("Sfidat", student.challenges)}
      ${profileCard("Përforcuesit e preferuar", student.reinforcers)}
      ${profileCard("Alergjitë", student.allergies)}
      ${profileCard("Profili i komunikimit", [student.communication, ...student.speechGoals])}
    </section>
    <section class="glass-card">
      <div class="card-header">
        <h3>Kohështrirja e objektivave</h3>
        <button class="text-button" data-route="progress">Regjistro progres</button>
      </div>
      <div class="timeline">
        ${[...student.immediateObjectives, ...student.longTermObjectives, ...student.completedGoals].map((goal, index) => `
          <div class="timeline-item">
            <div><strong>${index < student.immediateObjectives.length ? "I menjëhershëm" : index < student.immediateObjectives.length + student.longTermObjectives.length ? "Afatgjatë" : "I përfunduar"}</strong><p>${goal}</p></div>
          </div>
        `).join("")}
      </div>
    </section>
    <section class="glass-card">
      <div class="card-header">
        <h3>Mjete të rekomanduara</h3>
        <button class="text-button" data-route="tools">Krahaso mjetet</button>
      </div>
      <div class="recommendation-row">
        ${state.recommendations.slice(0, 3).map((tool) => `<button class="mini-tool" data-tool-id="${tool.id}" data-action="tool-details"><span>${tool.image}</span><strong>${tool.title}</strong><small>${tool.notes}</small></button>`).join("")}
      </div>
    </section>
  `;
}

function renderStudentList() {
  return `
    <section class="student-list-heading">
      <div>
        <p class="eyebrow">Pamje private</p>
        <h2>Profilet e nxënësve</h2>
        <p>Zgjidhni një pseudonim për të hapur profilin e plotë.</p>
      </div>
      <div class="student-list-actions">
        <span class="privacy-badge">Vetëm pseudonime</span>
        <button class="student-add-button" type="button" data-action="open-add-student">+ Shto profil</button>
      </div>
    </section>
    <section class="student-preview-grid" aria-label="Lista e profileve të nxënësve">
      ${state.students.map((student) => `
        <button
          class="student-preview-card"
          type="button"
          data-action="open-student-profile"
          data-student-id="${student.id}"
          aria-label="Hap profilin e ${student.nickname}, ${student.initials}"
        >
          <span class="animal-avatar" aria-hidden="true">${animalIcon(student.animal)}</span>
          <span class="student-preview-name">${student.nickname}</span>
          <span class="student-preview-initials">${student.initials}</span>
          <span class="student-preview-facts">
            <span><strong>Mosha</strong>${student.age} vjeç</span>
            <span><strong>Ditëlindja</strong>${student.birthday}</span>
            <span><strong>Objektiva</strong>${student.immediateObjectives.length}</span>
          </span>
        </button>
      `).join("")}
    </section>
  `;
}

function openAddStudentModal() {
  const animals = [
    ["bear", "Ariu"],
    ["lion", "Luani"],
    ["rabbit", "Lepuri"],
    ["fox", "Dhelpra"],
    ["cat", "Macja"],
    ["owl", "Bufi"],
    ["panda", "Panda"],
    ["turtle", "Breshka"]
  ];

  openModal("Profil i ri", "Shto profil nxënësi", `
    <form id="addStudentForm" class="student-add-form">
      <div class="student-add-fields">
        ${field("Pseudonimi", `<input name="nickname" placeholder="P.sh. Ylli i Artë" maxlength="40" required />`)}
        ${field("Inicialet", `<input name="initials" placeholder="P.sh. A.K." maxlength="8" required />`)}
        ${field("Mosha", `<input name="age" type="number" min="3" max="18" required />`)}
        ${field("Ditëlindja", `<input name="birthday" type="date" required />`)}
      </div>
      <fieldset class="animal-picker">
        <legend>Zgjidh ikonën e kafshës</legend>
        <div class="animal-choice-grid">
          ${animals.map(([value, label], index) => `
            <label class="animal-choice">
              <input type="radio" name="animal" value="${value}" ${index === 0 ? "checked" : ""} />
              <span class="animal-avatar" aria-hidden="true">${animalIcon(value)}</span>
              <span>${label}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      ${field("Objektivat aktuale", `<textarea name="objectives" rows="5" placeholder="Shkruani një objektiv për çdo rresht" required></textarea>`)}
      ${field("Alergjitë", `<textarea name="allergies" rows="3" placeholder="Shkruani një alergji për çdo rresht; lëreni bosh nëse nuk ka"></textarea>`)}
      <p class="student-add-note">Përdorni vetëm pseudonim dhe iniciale. Mos vendosni emër real ose diagnozë.</p>
      <button class="primary-button" type="submit">Ruaj profilin</button>
    </form>
  `);
}

function addStudentProfile(formData) {
  const objectives = String(formData.get("objectives") || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const allergies = String(formData.get("allergies") || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const student = new Student({
    nickname: String(formData.get("nickname") || "").trim(),
    initials: String(formData.get("initials") || "").trim().toUpperCase(),
    age: Number(formData.get("age")),
    birthday: formatBirthday(String(formData.get("birthday") || "")),
    animal: String(formData.get("animal") || "bear"),
    learningStyle: "Profili mësimor mund të plotësohet me mbështetje praktike dhe rutina të qarta.",
    diagnosis: "Profil mësimor",
    communicationAbilities: "Përfiton nga udhëzimet e qarta dhe mbështetja vizuale.",
    immediateObjectives: objectives,
    allergies: allergies.length ? allergies : ["Nuk janë shënuar alergji"],
    longTermObjectives: [],
    strengths: ["Pikat e forta do të plotësohen nga mësuesja"],
    challenges: ["Nevojat praktike do të plotësohen nga mësuesja"],
    preferredReinforcers: ["Përforcuesit do të plotësohen nga mësuesja"],
    behaviorTriggers: ["Shkaktarët do të plotësohen nga mësuesja"]
  });

  state.students.push(student);
  state.scheduleByStudent[student.id] = createInitialSchedule();
  state.progressByStudent[student.id] = [];
  activateStudent(student);
  state.studentProfileOpen = false;
  state.activity.unshift({ title: "U shtua profil i ri", detail: `Profili ${student.nickname} u krijua me pseudonim.` });
  closeModal();
  navigate("students");
  toast("Profili i ri u shtua.");
}

function formatBirthday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Nuk është shënuar";
  return new Date(`${value}T12:00:00`).toLocaleDateString("sq-AL", { day: "numeric", month: "long" });
}

function animalIcon(type) {
  const icons = {
    bear: `<svg viewBox="0 0 64 64"><circle class="animal-ear" cx="17" cy="17" r="10"/><circle class="animal-ear" cx="47" cy="17" r="10"/><circle class="animal-face" cx="32" cy="34" r="24"/><circle class="animal-eye" cx="24" cy="31" r="2.5"/><circle class="animal-eye" cx="40" cy="31" r="2.5"/><ellipse class="animal-muzzle" cx="32" cy="42" rx="10" ry="8"/><path class="animal-nose" d="M28 39h8l-4 4Z"/><path class="animal-smile" d="M32 43v3m0 0c-3 0-5 1-6 3m6-3c3 0 5 1 6 3"/></svg>`,
    lion: `<svg viewBox="0 0 64 64"><circle class="lion-mane" cx="32" cy="32" r="29"/><circle class="animal-ear" cx="17" cy="19" r="8"/><circle class="animal-ear" cx="47" cy="19" r="8"/><circle class="animal-face" cx="32" cy="33" r="21"/><circle class="animal-eye" cx="24" cy="31" r="2.5"/><circle class="animal-eye" cx="40" cy="31" r="2.5"/><ellipse class="animal-muzzle" cx="32" cy="41" rx="9" ry="7"/><path class="animal-nose" d="M28 38h8l-4 5Z"/></svg>`,
    rabbit: `<svg viewBox="0 0 64 64"><ellipse class="rabbit-ear" cx="22" cy="15" rx="8" ry="17" transform="rotate(-10 22 15)"/><ellipse class="rabbit-ear" cx="42" cy="15" rx="8" ry="17" transform="rotate(10 42 15)"/><circle class="animal-face" cx="32" cy="38" r="22"/><circle class="animal-eye" cx="24" cy="36" r="2.5"/><circle class="animal-eye" cx="40" cy="36" r="2.5"/><path class="rabbit-nose" d="M29 42h6l-3 4Z"/><path class="animal-smile" d="M32 46v3m0 0-5 3m5-3 5 3"/></svg>`,
    fox: `<svg viewBox="0 0 64 64"><path class="fox-head" d="M7 12 22 20c6-4 14-4 20 0l15-8-5 25c-2 14-10 22-20 22S14 51 12 37Z"/><path class="fox-cheek" d="M13 34c8 2 14 8 19 20 5-12 11-18 19-20-2 15-9 23-19 23S15 49 13 34Z"/><circle class="animal-eye" cx="24" cy="34" r="2.5"/><circle class="animal-eye" cx="40" cy="34" r="2.5"/><path class="animal-nose" d="M28 45h8l-4 5Z"/></svg>`,
    cat: `<svg viewBox="0 0 64 64"><path class="cat-head" d="m10 15 14 7c5-3 11-3 16 0l14-7-3 25c-2 12-9 19-19 19S15 52 13 40Z"/><circle class="animal-eye" cx="24" cy="35" r="2.5"/><circle class="animal-eye" cx="40" cy="35" r="2.5"/><path class="rabbit-nose" d="M29 43h6l-3 4Z"/><path class="animal-smile" d="M32 47v3m-4-6-10-2m10 5-10 2m18-5 10-2m-10 5 10 2"/></svg>`,
    owl: `<svg viewBox="0 0 64 64"><path class="owl-body" d="M12 27C12 13 20 6 32 6s20 7 20 21v25l-8-5-12 10-12-10-8 5Z"/><circle class="owl-eye-bg" cx="23" cy="28" r="10"/><circle class="owl-eye-bg" cx="41" cy="28" r="10"/><circle class="animal-eye" cx="23" cy="28" r="3"/><circle class="animal-eye" cx="41" cy="28" r="3"/><path class="owl-beak" d="m28 37 4 6 4-6Z"/></svg>`,
    panda: `<svg viewBox="0 0 64 64"><circle class="panda-ear" cx="17" cy="17" r="10"/><circle class="panda-ear" cx="47" cy="17" r="10"/><circle class="panda-face" cx="32" cy="34" r="24"/><ellipse class="panda-patch" cx="23" cy="31" rx="7" ry="9" transform="rotate(25 23 31)"/><ellipse class="panda-patch" cx="41" cy="31" rx="7" ry="9" transform="rotate(-25 41 31)"/><circle class="panda-eye" cx="24" cy="31" r="2"/><circle class="panda-eye" cx="40" cy="31" r="2"/><path class="animal-nose" d="M28 42h8l-4 5Z"/></svg>`,
    turtle: `<svg viewBox="0 0 64 64"><ellipse class="turtle-shell" cx="31" cy="35" rx="22" ry="17"/><circle class="turtle-head" cx="53" cy="34" r="9"/><circle class="animal-eye" cx="56" cy="32" r="1.8"/><circle class="turtle-leg" cx="18" cy="51" r="5"/><circle class="turtle-leg" cx="42" cy="51" r="5"/><path class="turtle-pattern" d="m20 25 11-6 11 6v13l-11 7-11-7Zm0 0-9 7m31-7 10 7M20 38l-8 5m30-5 8 5"/></svg>`
  };
  return icons[type] || icons.bear;
}

function profileCard(title, items) {
  return `
    <article class="profile-card">
      <h3>${title}</h3>
      <ul class="clean-list">${items.map((item) => `<li><span class="status-dot"></span>${item}</li>`).join("")}</ul>
    </article>
  `;
}

function renderUpload() {
  return `
    <section class="glass-card">
      <p class="eyebrow">Lexuesi i PIA / IEP</p>
      <h2>Ngarko ose ngjit planin e nxënësit</h2>
      <p>Mbështet PDF, DOCX, TXT dhe tekst të kopjuar. Emrat, inicialet dhe termat mjekësorë filtrohen para analizimit.</p>
      <div class="upload-zone" id="uploadZone">
        <div>
          <strong>Lësho këtu një skedar PDF, DOCX ose TXT</strong>
          <p>Emri i skedarit nuk përdoret kurrë si emër nxënësi.</p>
          <input id="fileUpload" type="file" accept=".pdf,.docx,.txt" aria-label="Ngarko planin e nxënësit" />
        </div>
      </div>
      <label class="field">
        <span>Kopjo dhe ngjit tekstin e planit</span>
        <textarea id="planText">Pseudonimi: Nxënësi A
Mosha: 7
Komunikimi: Përdor fraza verbale dhe përfiton nga zgjedhjet vizuale.
Objektivi i menjëhershëm: Të kërkojë ndihmë gjatë shkrimit me një kujtesë.
Objektivi afatgjatë: Të përfundojë rutinat e klasës me më shumë pavarësi.
Përforcues: Zgjedhja e rolit ndihmës në klasë.</textarea>
      </label>
      <div class="toolbar">
        <button class="primary-button" data-action="parse-plan">Analizo planin e nxënësit</button>
        <button class="secondary-button" data-route="students">Hap profilin aktual</button>
      </div>
    </section>
    <section id="parserOutput"></section>
  `;
}

function renderTools(title, tools) {
  const categories = [
    { value: "All", label: "Të gjitha" },
    ...[...new Set(educationalTools.map((tool) => tool.category))].map((category) => ({ value: category, label: translateToolLabel(category) }))
  ];
  return `
    <section class="glass-card">
      <p class="eyebrow">Përputhësi i mjeteve me AI</p>
      <h2>${title}</h2>
      <p class="tool-access-note">Të gjitha paketat janë të hapura për çdo mësuese.</p>
      <div class="filter-grid">
        ${field("Kategoria", select("toolCategory", categories))}
        ${field("Mosha", `<input id="toolAge" type="number" min="3" max="18" value="${state.currentStudent.age}" />`)}
        ${field("Objektivi", `<input id="toolGoal" placeholder="Komunikim, motorikë fine..." />`)}
        ${field("Teknologjia", select("toolTech", [
          { value: "All", label: "Të gjitha" },
          { value: "No tech", label: "Pa teknologji" },
          { value: "Low tech", label: "Teknologji e thjeshtë" },
          { value: "Mid tech", label: "Teknologji mesatare" }
        ]))}
      </div>
    </section>
    <section class="tools-grid" id="toolsGrid">
      ${toolCards(tools)}
    </section>
  `;
}

function toolCards(tools) {
  return tools.map((tool) => `
    <article class="tool-card slide-up" data-tool-card="${tool.id}">
      <div class="row" style="justify-content:space-between; gap:1rem;">
        <div class="tool-image" aria-hidden="true">${tool.image}</div>
        <span class="badge">E hapur</span>
      </div>
      <div>
        <p class="eyebrow">${translateToolLabel(tool.category)}</p>
        <h3>${tool.title}</h3>
        <p>${tool.description}</p>
      </div>
      <div class="tool-meta">
        <span class="badge">${tool.ageRange}</span>
        <span class="badge">${translateToolLabel(tool.goal)}</span>
        <span class="badge">${translateToolLabel(tool.difficulty)}</span>
      </div>
      <small>${tool.frequency}</small>
      <div class="toolbar">
        <button class="secondary-button" data-tool-id="${tool.id}" data-action="tool-details">Shiko detajet</button>
        <button class="text-button" data-tool-id="${tool.id}" data-action="save-tool">${state.savedTools.has(tool.id) ? "U ruajt" : "Ruaj"}</button>
        <button class="text-button" data-tool-id="${tool.id}" data-action="favorite-tool">${state.favoriteTools.has(tool.id) ? "I preferuar" : "Prefero"}</button>
        <button class="text-button" data-tool-id="${tool.id}" data-action="compare-tool">Krahaso</button>
        <button class="text-button" data-tool-id="${tool.id}" data-action="video-tool">Video</button>
        <button class="text-button" data-tool-id="${tool.id}" data-action="lesson-tool">Krijo mësim</button>
      </div>
    </article>
  `).join("");
}

function renderAAC() {
  const material = state.lastMaterial || generateAAC("Dua të mësoj larjen e duarve.");
  state.lastMaterial = material;
  return `
    <section class="glass-card">
      <p class="eyebrow">Gjeneratori i materialeve AAC</p>
      <h2>Krijo mbështetje gati për klasë</h2>
      <div class="form-row" style="gap:0.7rem; align-items:end;">
        ${field("Objektivi i mësimit", `<input id="aacPrompt" value="Dua të mësoj larjen e duarve." />`)}
        <button class="primary-button" data-action="generate-aac">Krijo</button>
      </div>
      <div class="toolbar">
        <button class="secondary-button" data-action="print-view">Printo</button>
        <button class="secondary-button" data-action="download-placeholder">Shkarko PDF</button>
        <button class="secondary-button" data-action="copy-material">Kopjo</button>
        <button class="secondary-button" data-action="edit-material">Ndrysho</button>
        <button class="secondary-button" data-action="regenerate-material">Rigjenero</button>
      </div>
    </section>
    <section id="aacOutput" class="materials-grid">${renderMaterial(material)}</section>
  `;
}

function renderMaterial(material) {
  return `
    ${materialCard("Kartela mësimore", material.flashcards.map((card) => `<strong>${card.word}</strong><span>${card.cue}</span>`))}
    <article class="material-card">
      <h3>Tabela e komunikimit</h3>
      <div class="board-grid">${material.communicationBoard.flat().map((cell) => `<div class="board-cell" contenteditable="false">${cell}</div>`).join("")}</div>
    </article>
    ${materialCard("Sekuenca vizuale", material.visualSequence)}
    ${materialCard("Histori sociale", material.socialStory)}
    ${materialCard("Aktivitete në klasë", material.activities)}
    ${materialCard("Fletë pune për printim", material.worksheets)}
    ${materialCard("Tabela e shpërblimit", material.rewardChart.map((item) => `${item.step}: ende pa u fituar`))}
    ${materialCard("Lojë përputhjeje", material.matchingGame.map((item) => `${item.word} me ${item.match}`))}
    ${materialCard("Lista e fjalorit", material.vocabulary)}
    ${materialCard("Nxitje me figura", material.picturePrompts)}
    ${materialCard("Listë kontrolli", material.checklist.map((item) => item.label))}
    ${materialCard("Kohëmatësi dhe rutina", [...material.timerSequence.map((item) => `${item.step}: ${item.minutes} min`), ...material.routineSchedule])}
  `;
}

function materialCard(title, items) {
  return `
    <article class="material-card">
      <h3>${title}</h3>
      <ul class="clean-list">${items.map((item) => `<li><span class="status-dot"></span>${item}</li>`).join("")}</ul>
    </article>
  `;
}

function renderCommunicationBoards() {
  return `
    <section class="communication-module-shell" aria-label="Tabela komunikimi">
      <iframe
        class="communication-module-frame"
        title="Tabela komunikimi"
      ></iframe>
    </section>
  `;
}

function renderSchedule() {
  const entries = getStudentSchedule(state.currentStudent.id)[state.scheduleDay];
  const goals = state.currentStudent.immediateObjectives.length
    ? state.currentStudent.immediateObjectives
    : ["Të ndjekë rutinën e ditës", "Të kërkojë ndihmë"];
  return `
    <section class="cute-schedule-shell">
      <svg class="schedule-decoration flower-one" viewBox="0 0 80 80" aria-hidden="true"><path d="M39 42C18 45 11 27 25 22c-1-17 23-19 27-4 16-5 24 17 9 25 8 15-14 25-22 10-10 12-28-3-17-15 4-4 10-3 17 4Z"/><circle cx="40" cy="38" r="9"/></svg>
      <svg class="schedule-decoration leaf-sprig" viewBox="0 0 90 90" aria-hidden="true"><path d="M15 76C32 58 48 40 70 17"/><ellipse cx="30" cy="59" rx="13" ry="7" transform="rotate(38 30 59)"/><ellipse cx="47" cy="43" rx="13" ry="7" transform="rotate(-32 47 43)"/><ellipse cx="62" cy="28" rx="12" ry="7" transform="rotate(35 62 28)"/></svg>
      <div class="schedule-heading">
        <div>
          <p class="eyebrow">PlanifikoMeAtlas</p>
          <h2>Orari i javës</h2>
          <p>Organizoni aktivitetet dhe lidhni objektivat me çdo orë.</p>
        </div>
        <div class="schedule-week-control">
          <span>Java ${state.scheduleWeekOffset + 1}</span>
          <button type="button" data-action="schedule-next-week">Java tjetër →</button>
        </div>
      </div>

      <nav class="schedule-days" aria-label="Ditët e javës">
        ${scheduleDays.map((day, index) => `<button type="button" data-action="schedule-day" data-day-index="${index}" aria-current="${index === state.scheduleDay ? "date" : "false"}">${day}</button>`).join("")}
      </nav>

      <section class="schedule-student-picker" aria-label="Zgjidh nxënësin për orarin">
        <div>
          <h3>Orari i nxënësit</h3>
          <p>Çdo profil ka orarin e vet.</p>
        </div>
        <div class="schedule-student-options">
          ${state.students.map((student) => `
            <button
              type="button"
              data-action="schedule-student"
              data-student-id="${student.id}"
              aria-pressed="${student.id === state.currentStudent.id}"
            >
              <span class="schedule-student-animal" aria-hidden="true">${animalIcon(student.animal)}</span>
              <span><strong>${escapeHtml(student.nickname)}</strong><small>${escapeHtml(student.initials)}</small></span>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="schedule-goal-bank">
        <div>
          <h3>Objektivat për t'u lidhur</h3>
          <p>Zvarriteni një objektiv te ora e dëshiruar.</p>
        </div>
        <div class="schedule-goal-chips">
          ${goals.map((goal, index) => `<button class="schedule-goal-chip" type="button" draggable="true" data-schedule-goal="${escapeHtml(goal)}"><span aria-hidden="true">★</span>${escapeHtml(goal)}</button>`).join("")}
        </div>
      </section>

      <section class="schedule-day-panel">
        <div class="schedule-day-title">
          <span class="schedule-animal" aria-hidden="true">${animalIcon(state.currentStudent.animal)}</span>
          <div><p>Plani ditor</p><h3>${scheduleDays[state.scheduleDay]}</h3></div>
        </div>
        <div class="schedule-slots">
          ${entries.map((slot, index) => `
            <article class="schedule-slot schedule-pastel-${(index % 3) + 1}" data-schedule-slot="${slot.id}">
              <button class="schedule-complete" type="button" data-action="toggle-slot-complete" data-slot-id="${slot.id}" aria-pressed="${slot.completed}" aria-label="${slot.completed ? "Shëno si të papërfunduar" : "Shëno si të përfunduar"}: ${escapeHtml(slot.activity)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg>
              </button>
              <button class="schedule-slot-main" type="button" data-action="edit-schedule-slot" data-slot-id="${slot.id}">
                <span class="schedule-time">${slot.start} – ${slot.end}</span>
                <strong>${escapeHtml(slot.activity)}</strong>
                <span class="schedule-linked-goal ${slot.goal ? "has-goal" : ""}">${slot.goal ? `Objektivi: ${escapeHtml(slot.goal)}` : "Shtoni ose zvarritni një objektiv"}</span>
              </button>
              <span class="schedule-edit-hint">Klikoni për ta ndryshuar</span>
            </article>
          `).join("")}
        </div>
      </section>
    </section>
  `;
}

function selectScheduleDay(index) {
  if (!Number.isInteger(index) || index < 0 || index >= scheduleDays.length) return;
  state.scheduleDay = index;
  navigate("schedules");
}

function getStudentSchedule(studentId) {
  if (!state.scheduleByStudent[studentId]) state.scheduleByStudent[studentId] = createInitialSchedule();
  return state.scheduleByStudent[studentId];
}

function selectScheduleStudent(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;
  activateStudent(student);
  getStudentSchedule(student.id);
  navigate("schedules");
  toast(`U hap orari i ${student.nickname}.`);
}

function nextScheduleWeek() {
  state.scheduleWeekOffset = (state.scheduleWeekOffset + 1) % 4;
  navigate("schedules");
  toast(`U hap Java ${state.scheduleWeekOffset + 1}.`);
}

function findScheduleSlot(slotId) {
  return getStudentSchedule(state.currentStudent.id).flat().find((slot) => slot.id === slotId);
}

function toggleScheduleSlot(slotId) {
  const slot = findScheduleSlot(slotId);
  if (!slot) return;
  slot.completed = !slot.completed;
  navigate("schedules");
  toast(slot.completed ? "Objektivi i orës u përfundua!" : "Objektivi u rihap.");
}

function openScheduleSlotEditor(slotId) {
  const slot = findScheduleSlot(slotId);
  if (!slot) return;
  const goals = state.currentStudent.immediateObjectives;
  openModal("Ndryshim i shpejtë", "Ndrysho orën", `
    <form id="scheduleSlotForm" class="schedule-slot-form">
      <input type="hidden" name="slotId" value="${slot.id}" />
      <div class="schedule-time-fields">
        ${field("Fillimi", `<input type="time" name="start" value="${slot.start}" required />`)}
        ${field("Përfundimi", `<input type="time" name="end" value="${slot.end}" required />`)}
      </div>
      ${field("Lënda ose aktiviteti", `<input name="activity" value="${escapeHtml(slot.activity)}" required />`)}
      ${field("Objektivi", `<select name="goal"><option value="">Pa objektiv të lidhur</option>${goals.map((goal) => `<option value="${escapeHtml(goal)}" ${goal === slot.goal ? "selected" : ""}>${escapeHtml(goal)}</option>`).join("")}</select>`)}
      <button class="primary-button" type="submit">Ruaj ndryshimet</button>
    </form>
  `);
}

function saveScheduleSlot(formData) {
  const slot = findScheduleSlot(String(formData.get("slotId")));
  if (!slot) return;
  slot.start = String(formData.get("start"));
  slot.end = String(formData.get("end"));
  slot.activity = String(formData.get("activity")).trim();
  slot.goal = String(formData.get("goal") || "");
  closeModal();
  navigate("schedules");
  toast("Ora u përditësua.");
}

function handleScheduleDragStart(event) {
  const chip = event.target.closest("[data-schedule-goal]");
  if (!chip || !event.dataTransfer) return;
  event.dataTransfer.setData("text/plain", chip.dataset.scheduleGoal);
  event.dataTransfer.effectAllowed = "copy";
}

function handleScheduleDragOver(event) {
  const slot = event.target.closest("[data-schedule-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.add("drag-over");
}

function handleScheduleDragLeave(event) {
  const slot = event.target.closest("[data-schedule-slot]");
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove("drag-over");
}

function handleScheduleDrop(event) {
  const slotNode = event.target.closest("[data-schedule-slot]");
  if (!slotNode || !event.dataTransfer) return;
  event.preventDefault();
  const slot = findScheduleSlot(slotNode.dataset.scheduleSlot);
  const goal = event.dataTransfer.getData("text/plain");
  if (!slot || !goal) return;
  slot.goal = goal;
  navigate("schedules");
  toast("Objektivi u lidh me orën.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderProgress() {
  return `
    <section class="progress-results-layout">
      <form class="glass-card progress-result-form" id="progressForm">
        <p class="eyebrow">Rezultat i ri</p>
        <h2>Ndiq progresin</h2>
        <p>Shënoni me fjalë të qarta çfarë arriti fëmija.</p>
        ${field("Data", `<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" />`)}
        ${field("Objektivi", `<input name="goal" value="${state.currentStudent.immediateObjectives[0]}" />`)}
        ${field("Rezultati i arritur", `<textarea name="result" placeholder="P.sh. Kërkoi ndihmë pa kujtesë dhe përfundoi detyrën." required></textarea>`)}
        <button class="primary-button" type="submit">Ruaj rezultatin</button>
      </form>
      <section class="glass-card recorded-results">
        <div class="card-header"><div><p class="eyebrow">Historia</p><h2>Rezultatet e arritura</h2></div><span class="badge">${state.progressEntries.length} shënime</span></div>
        <ul class="result-list">
          ${state.progressEntries.slice().reverse().map((entry) => `<li><time>${escapeHtml(entry.date)}</time><div><strong>${escapeHtml(entry.goal)}</strong><p>${escapeHtml(entry.result)}</p></div></li>`).join("")}
        </ul>
      </section>
    </section>
  `;
}

function renderReports() {
  if (!state.reportPreviewOpen) return renderReportList();

  const report = generateParentReport(state.currentStudent, state.progressEntries);
  return `
    <button class="student-back-button" type="button" data-action="back-report-list">← Kthehu te raportet</button>
    <section class="report-preview-toolbar">
      <div><p class="eyebrow">Preview</p><h2>Raporti i ${state.currentStudent.nickname}</h2></div>
      <div class="report-actions">
        <button class="primary-button" data-action="download-report-pdf">Shkarko PDF</button>
        <button class="secondary-button" data-action="print-view">Printo</button>
      </div>
    </section>
    <article class="report-paper" id="parentReport">
      <header class="report-paper-header">
        <span class="animal-avatar" aria-hidden="true">${animalIcon(state.currentStudent.animal)}</span>
        <div><p>PlanifikoMeAtlas</p><h2>${report.title}</h2><span>${state.currentStudent.initials} · ${new Date().toLocaleDateString("sq-AL")}</span></div>
      </header>
      <p class="report-intro">Përmbledhje e qartë e progresit, e përgatitur për familjen.</p>
      <section class="report-paper-grid">
        ${profileCard("Pikat e forta", report.strengths)}
        ${profileCard("Rezultatet e arritura", report.achievements.map(escapeHtml))}
        ${profileCard("Fusha që duan mbështetje", report.support)}
        ${profileCard("Aktivitete të sugjeruara në shtëpi", report.homeActivities)}
      </section>
    </article>
  `;
}

function renderReportList() {
  return `
    <section class="student-list-heading report-list-heading">
      <div><p class="eyebrow">Raporte për prindër</p><h2>Zgjidhni nxënësin</h2><p>Çdo profil ka preview-n dhe raportin e vet.</p></div>
      <span class="privacy-badge">Raporte private</span>
    </section>
    <section class="report-student-grid" aria-label="Lista e raporteve të nxënësve">
      ${state.students.map((student) => {
        const results = getStudentProgress(student.id);
        return `<button class="report-student-card" type="button" data-action="open-report-preview" data-student-id="${student.id}" aria-label="Hap raportin e ${student.nickname}, ${student.initials}">
          <span class="animal-avatar" aria-hidden="true">${animalIcon(student.animal)}</span>
          <span><strong>${escapeHtml(student.nickname)}</strong><small>${escapeHtml(student.initials)}</small></span>
          <span class="report-ready-badge">Raporti gati</span>
          <span class="report-result-count">${results.length} rezultate të regjistruara</span>
        </button>`;
      }).join("")}
    </section>
  `;
}

function renderCoach() {
  return `
    <section class="chat-shell">
      <div class="atlas-welcome">
        ${atlasAvatar("large")}
        <div>
          <p class="eyebrow">Trajneri AI për mësimdhënie</p>
          <h2>Bisedo me Atlasin, asistentin tënd për PIA!</h2>
          <p>Atlas ofron udhëzime të qeta, ide praktike dhe strategji të gatshme për klasë sipas planit të ${state.currentStudent.name}.</p>
        </div>
      </div>
      <div class="suggestions">
        ${suggestedQuestions.map((question) => `<button class="secondary-button" data-action="suggestion">${question}</button>`).join("")}
      </div>
      <div class="chat-log" id="chatLog">
        ${state.chatMessages.map(renderMessage).join("")}
      </div>
      <form class="chat-form" id="chatForm">
        <label class="field">
          <span>Dërgo mesazh te Atlas</span>
          <input id="chatInput" placeholder="Pyet për strategji, ide mësimi ose shpjegim për familjen..." autocomplete="off" />
        </label>
        <button class="primary-button" type="submit">Dërgo</button>
      </form>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="settings-grid">
      <article class="settings-panel">
        <p class="eyebrow">Pamja</p>
        <h2>Cilësimet</h2>
        <label class="toggle"><span>Modaliteti i errët</span><input type="checkbox" ${state.theme === "dark" ? "checked" : ""} data-action="toggle-theme" /></label>
        ${field("Gjuha", select("language", ["Shqip", "Anglisht", "Spanjisht", "Frëngjisht"]))}
        ${field("Ngjyra e temës", `<input type="color" id="themeColor" value="#3454d1" />`)}
        ${field("Madhësia e shkronjave", `<input id="fontSize" type="range" min="0.9" max="1.2" step="0.05" value="1" />`)}
      </article>
      <article class="settings-panel">
        <p class="eyebrow">Privatësia dhe qasshmëria</p>
        <h2>Kontrollet</h2>
        <label class="toggle"><span>Njoftimet</span><input type="checkbox" checked /></label>
        <label class="toggle"><span>Tregues fokusi me kontrast të lartë</span><input type="checkbox" checked /></label>
        <label class="toggle"><span>Përditësime për lexues ekrani</span><input type="checkbox" checked /></label>
        <div class="toolbar">
          <button class="secondary-button" data-action="backup-placeholder">Rezervim provë</button>
          <button class="danger-button" data-action="clear-memory">Pastro memorien</button>
        </div>
      </article>
    </section>
  `;
}

function attachUploadZone() {
  const zone = document.getElementById("uploadZone");
  if (!zone) return;
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
  }));
  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) readPlanFile(file);
  });
}

async function readPlanFile(file) {
  if (file.name.endsWith(".txt")) {
    document.getElementById("planText").value = sanitizePlanText(await file.text());
  } else {
    document.getElementById("planText").value = `Pseudonimi: Nxënësi A
Komunikimi: Ngjitni tekstin e nxjerrë nga dokumenti për analizë të plotë.
Objektivi i menjëhershëm: Përdor mbështetje vizuale gjatë rutinës së klasës.`;
  }
  toast("Dokumenti u ngarkua dhe u anonimizua.");
}

async function parsePlanFromInputs() {
  const output = document.getElementById("parserOutput");
  const textArea = document.getElementById("planText");
  const text = sanitizePlanText(textArea.value);

  if (!text) {
    output.innerHTML = `<section class="glass-card parser-error"><h3>Teksti mungon</h3><p>Ngarkoni një dokument ose ngjitni tekstin e planit para analizimit.</p></section>`;
    toast("Shtoni tekstin e planit para analizimit.");
    return;
  }

  textArea.value = text;
  output.innerHTML = document.getElementById("loadingTemplate").innerHTML;

  try {
    const parsed = await parseIEP(text);
    const student = privatizeStudent(normalizeParsedStudent(parsed));
    const summary = buildPlanSummary(student);
    state.students.unshift(student);
    state.scheduleByStudent[student.id] = createInitialSchedule();
    state.progressByStudent[student.id] = [];
    activateStudent(student);
    state.activity.unshift({ title: "Plani u analizua", detail: `Përmbledhja private e ${student.nickname} u krijua.` });
    refreshDerivedState();
    output.innerHTML = `
      <section class="glass-card plan-summary">
        <div class="card-header">
          <div>
            <p class="eyebrow">Analizë e anonimizuar</p>
            <h3>Përmbledhja e planit</h3>
          </div>
          <span class="privacy-badge">E anonimizuar</span>
        </div>
        <div class="plan-summary-grid">
          ${summaryCard("Pikat e forta", summary.strengths)}
          ${summaryCard("Sfidat kryesore", summary.challenges)}
          ${summaryCard("Objektivat e sugjeruara", summary.objectives)}
        </div>
        <button class="primary-button" data-route="students">Shiko profilin e nxënësit</button>
      </section>`;
    toast("Përmbledhja private u krijua.");
  } catch (error) {
    console.error(error);
    output.innerHTML = `<section class="glass-card parser-error"><h3>Analizimi dështoi</h3><p>Kontrolloni tekstin dhe provoni përsëri.</p></section>`;
    toast("Nuk mundëm ta analizonim planin. Provoni përsëri.");
  }
}

function buildPlanSummary(student) {
  return {
    strengths: student.strengths.slice(0, 3),
    challenges: student.challenges.slice(0, 3),
    objectives: [...student.immediateObjectives, ...student.longTermObjectives].slice(0, 4)
  };
}

function summaryCard(title, items) {
  const safeItems = items.length ? items : ["Për t'u plotësuar nga mësuesja"];
  return `<article class="plan-summary-card"><h4>${title}</h4><ul>${safeItems.map((item) => `<li>${item}</li>`).join("")}</ul></article>`;
}

function privatizeStudent(student) {
  const animals = ["bear", "lion", "rabbit", "fox"];
  const index = state.students.length;
  student.nickname = `Ylli i Ri ${index + 1}`;
  student.name = student.nickname;
  student.initials = "N.X.";
  student.birthday = "Nuk është shënuar";
  student.animal = animals[index % animals.length];
  student.learningStyle = student.communication || "Përfiton nga udhëzimet e qarta dhe mbështetja vizuale.";
  student.diagnosis = "Profil mësimor";
  return student;
}

function filterToolsFromControls() {
  const filters = {
    category: document.getElementById("toolCategory")?.value || "All",
    age: document.getElementById("toolAge")?.value || "",
    goal: document.getElementById("toolGoal")?.value || "",
    techLevel: document.getElementById("toolTech")?.value || "All"
  };
  const grid = document.getElementById("toolsGrid");
  if (grid) grid.innerHTML = toolCards(recommendTools(state.currentStudent, filters));
}

document.addEventListener("input", (event) => {
  if (["toolGoal", "toolAge", "fontSize"].includes(event.target.id)) {
    if (event.target.id === "fontSize") document.documentElement.style.setProperty("--font-scale", event.target.value);
    else filterToolsFromControls();
  }
});

document.addEventListener("change", (event) => {
  if (["toolCategory", "toolTech"].includes(event.target.id)) filterToolsFromControls();
  if (event.target.id === "themeColor") document.documentElement.style.setProperty("--primary", event.target.value);
});

function showToolDetails(toolId) {
  const tool = educationalTools.find((item) => item.id === toolId);
  if (!tool) return;
  openModal("Detajet e mjetit", tool.title, `
    <div class="profile-top">
      <div class="tool-image">${tool.image}</div>
      <div>
        <p>${tool.description}</p>
        <div class="badge-row">
          <span class="badge">${translateToolLabel(tool.category)}</span>
          <span class="badge">${tool.ageRange}</span>
          <span class="badge">${translateToolLabel(tool.techLevel)}</span>
          <span class="badge">E hapur</span>
        </div>
      </div>
    </div>
    <h3>Shënime për mësuesin</h3>
    <p>${tool.notes}</p>
    <h3>Video</h3>
    <p>Parapamje video provë: më vonë mund të lidhet një bibliotekë e sigurt videosh ose klip trajnimi.</p>
  `);
}

function showLesson(toolId) {
  const tool = educationalTools.find((item) => item.id === toolId);
  const lesson = generateLesson(tool, state.currentStudent.name);
  openModal("Mësim i krijuar", lesson.title, `
    <p><strong>Kohëzgjatja:</strong> ${lesson.duration}</p>
    ${profileCard("Hapat", lesson.steps)}
    ${profileCard("Materialet", lesson.materials)}
  `);
}

function showVideoPlaceholder(toolId) {
  const tool = educationalTools.find((item) => item.id === toolId);
  if (!tool) return;
  openModal(
    "Parapamje video",
    `Klip trajnimi për ${tool.title}`,
    "<p>Ky funksion provë është gati për një bibliotekë të sigurt videosh në të ardhmen. Për tani, përdor shënimet për mësuesin dhe mësimin e krijuar për të modeluar strategjinë.</p>"
  );
}

function toggleSet(set, id, addMessage, removeMessage) {
  if (set.has(id)) {
    set.delete(id);
    toast(removeMessage);
  } else {
    set.add(id);
    toast(addMessage);
  }
  navigate(state.route);
}

function toggleCompare(toolId) {
  if (state.compareTools.has(toolId)) state.compareTools.delete(toolId);
  else state.compareTools.add(toolId);
  const compared = [...state.compareTools].map((id) => educationalTools.find((tool) => tool.id === id)).filter(Boolean);
  openModal("Krahasimi i mjeteve", "Krahaso mjetet e zgjedhura", compared.length ? `
    <div class="tools-grid">${toolCards(compared)}</div>
  ` : "<p>Nuk është zgjedhur ende asnjë mjet për krahasim.</p>");
}

function generateAACFromInput() {
  const prompt = document.getElementById("aacPrompt")?.value || "I want to teach hand washing.";
  state.lastMaterial = generateAAC(prompt);
  const output = document.getElementById("aacOutput");
  if (output) output.innerHTML = renderMaterial(state.lastMaterial);
  toast("Materialet AAC u krijuan.");
}

async function copyMaterial() {
  const content = state.route === "aac" || state.route === "boards"
    ? materialToMarkdown(state.lastMaterial)
    : root.innerText;
  try {
    await navigator.clipboard.writeText(content);
    toast("U kopjua në clipboard.");
  } catch {
    toast("Kopjimi u bllokua nga shfletuesi, por përmbajtja është e dukshme në ekran.");
  }
}

function enableMaterialEditing() {
  document.querySelectorAll(".material-card, .board-cell").forEach((node) => node.setAttribute("contenteditable", "true"));
  toast("Kartat e materialeve tani mund të ndryshohen.");
}

function selectMood(button) {
  state.selectedMood = button.textContent.trim();
  document.querySelectorAll(".mood-button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
}

function addProgressEntry(formData) {
  const entry = createProgressEntry({
    date: formData.get("date"),
    goal: formData.get("goal"),
    result: formData.get("result")
  });
  state.progressEntries.push(entry);
  state.activity.unshift({ title: "Rezultati u regjistrua", detail: `${entry.goal}: ${entry.result}` });
  refreshDerivedState();
  toast("Rezultati u ruajt dhe është gati për raportin e prindërve.");
  navigate("progress");
}

function renderParentReport() {
  toast("Raporti për prindër u rifreskua nga të dhënat aktuale të progresit.");
  navigate("reports");
}

async function sendCoachMessage(message) {
  const clean = message.trim();
  if (!clean) return;
  state.chatMessages.push({ role: "teacher", text: clean, time: new Date() });
  navigate("coach");
  const log = document.getElementById("chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="message ai" id="typingMessage">${atlasAvatar("small")}<div class="message-bubble atlas-bubble"><span class="spinner" style="width:1.2rem;height:1.2rem;border-width:2px;"></span> Atlas po mendon...</div></div>`);
  scrollChatToBottom();
  const response = await teacherCoach(clean, state.currentStudent);
  state.chatMessages.push({ role: "ai", text: response, time: new Date() });
  navigate("coach");
}

function renderMessage(message) {
  const avatarMarkup = message.role === "teacher"
    ? `<div class="avatar teacher-avatar" aria-hidden="true">TC</div>`
    : atlasAvatar("small");
  const bubbleClass = message.role === "teacher" ? "" : " atlas-bubble";
  return `
    <article class="message ${message.role}">
      ${avatarMarkup}
      <div class="message-bubble${bubbleClass}">
        ${renderMarkdown(message.text)}
        <time>${new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      </div>
    </article>
  `;
}

function atlasAvatar(size = "small") {
  return `
    <div class="atlas-avatar ${size === "large" ? "atlas-avatar-large" : ""}" aria-label="Avatari i Atlasit" role="img">
      <img src="assets/images/atlas-standing-widget.png" alt="" />
    </div>
  `;
}

function scrollChatToBottom() {
  const log = document.getElementById("chatLog");
  if (log) log.scrollTop = log.scrollHeight;
}

function handleSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
    return;
  }
  const items = [
    ...state.students.map((student) => ({ title: `${student.nickname} ${student.initials}`, detail: student.learningStyle, route: "students" })),
    ...educationalTools.map((tool) => ({ title: tool.title, detail: `${tool.category}: ${tool.goal}`, route: "tools" })),
    { title: "Raport për prindër", detail: `Përditësim i thjeshtë për familjen e ${state.currentStudent.name}`, route: "reports" }
  ].filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query));

  searchResults.innerHTML = `<strong>${items.length} rezultat${items.length === 1 ? "" : "e"}</strong>${items.slice(0, 6).map((item) => `<button class="search-result" data-route="${item.route}"><strong>${item.title}</strong><br><span>${item.detail}</span></button>`).join("")}`;
  searchResults.classList.remove("hidden");
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  toast(`U aktivizua modaliteti ${state.theme === "dark" ? "i errët" : "i çelët"}.`);
}

function clearMemory() {
  state.students = state.students.slice(0, 1);
  state.currentStudent = state.students[0];
  state.savedTools.clear();
  state.favoriteTools.clear();
  state.compareTools.clear();
  state.completedGoals.clear();
  state.scheduleByStudent = Object.fromEntries(state.students.map((student) => [student.id, createInitialSchedule()]));
  state.progressByStudent = { [state.currentStudent.id]: [] };
  state.progressEntries = state.progressByStudent[state.currentStudent.id];
  refreshDerivedState();
  state.activity = [{ title: "Memoria u pastrua", detail: "Në këtë sesion mbetet vetëm nxënësi shembull." }];
  toast("Të dhënat e sesionit në memorie u pastruan.");
  navigate("dashboard");
}

function openModal(eyebrow, title, body) {
  modalEyebrow.textContent = eyebrow;
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.querySelector(".modal-close").focus();
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 3200);
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function field(label, control) {
  return `<label class="field"><span>${label}</span>${control}</label>`;
}

function select(id, options) {
  return `<select id="${id}">${options.map((option) => {
    const item = typeof option === "string" ? { value: option, label: option } : option;
    return `<option value="${item.value}">${item.label}</option>`;
  }).join("")}</select>`;
}

function translateToolLabel(value) {
  const labels = {
    All: "Të gjitha",
    Free: "Falas",
    Easy: "E lehtë",
    Medium: "Mesatare",
    AAC: "AAC",
    PECS: "PECS",
    "Visual schedules": "Oraret vizuale",
    Timers: "Kohëmatës",
    "Token boards": "Tabela me tokenë",
    "Noise-canceling headphones": "Kufje për ulje zhurme",
    "Fine motor games": "Lojëra për motorikë fine",
    "Emotional regulation": "Rregullim emocional",
    "Functional communication": "Komunikim funksional",
    Requesting: "Kërkesa",
    Transitions: "Kalime",
    "Executive functioning": "Funksionim ekzekutiv",
    "Positive reinforcement": "Përforcim pozitiv",
    "Sensory regulation": "Rregullim shqisor",
    "Fine motor": "Motorikë fine",
    "Self-regulation": "Vetërregullim",
    "No tech": "Pa teknologji",
    "Low tech": "Teknologji e thjeshtë",
    "Mid tech": "Teknologji mesatare"
  };
  return labels[value] || value;
}

function slider(name, label, value) {
  return `
    <label class="field">
      <span>${label}</span>
      <div class="slider-row">
        <input type="range" name="${name}" min="0" max="100" value="${value}" />
        <output>${value}%</output>
      </div>
    </label>
  `;
}

function progressMetric(label, value) {
  return `
    <div class="field" style="margin-bottom:0.8rem;">
      <span>${label}</span>
      <div class="progress-bar"><span style="width:${value}%"></span></div>
    </div>
  `;
}
