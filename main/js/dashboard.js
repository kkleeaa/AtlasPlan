export function renderDashboard(state) {
  const student = state.currentStudent;
  return `
    <section class="hero-panel dashboard-welcome fade-in">
      <div class="dashboard-welcome-copy">
        <div class="dashboard-welcome-title">
          <span class="welcome-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path class="wave-palm" d="M15.5 22.5c1.6-1.2 3.7-.8 4.8.8l1.2 1.8V11.8a3.1 3.1 0 0 1 6.2 0v8.5-11a3.1 3.1 0 0 1 6.2 0v11.5-8.6a3 3 0 0 1 6 0v13.5c0 9.2-5.9 15.3-14.6 15.3-5.7 0-9.3-2.8-12.5-7.2l-4.4-6.1a3.4 3.4 0 0 1 7.1-5.2Z" />
              <path class="wave-detail" d="M21.5 25.1v4.2M27.7 20.3v8M33.9 20.8v7.5" />
              <path class="wave-motion" d="M8.7 13.2 5.5 10M11.8 8.6 10.7 4.3M7.2 18.5H2.8" />
            </svg>
          </span>
          <h2>Mirë se u kthyet, mësuese Carter</h2>
        </div>
        <p>Filloni me hapat e sotëm!</p>
      </div>
      <div class="dashboard-teacher-avatar" role="img" aria-label="Profili standard i mësueses Carter">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="teacher-avatar-bg" cx="32" cy="32" r="30" />
          <path class="teacher-hair" d="M18 28c0-11 6.4-18 14.4-18 9.2 0 15.6 7.6 14.2 19.2-3.1-2.1-5.8-5.4-7.1-9.2-4 5.2-10.7 8.2-21.5 8Z" />
          <circle class="teacher-face" cx="32" cy="28" r="12" />
          <path class="teacher-hair-front" d="M20.8 24.7c1.6-8.5 6.5-12.9 12.3-12.9 6.1 0 10.6 4 12 10.2-5.4-1.2-9.4-3.5-12.1-6.5-2.5 4.2-6.5 7.3-12.2 9.2Z" />
          <circle class="teacher-eye" cx="27.5" cy="28.5" r="1" />
          <circle class="teacher-eye" cx="36.5" cy="28.5" r="1" />
          <path class="teacher-smile" d="M27.8 33.2c2.7 2.3 5.8 2.3 8.5 0" />
          <path class="teacher-shirt" d="M12.5 57.5c1.8-10.2 9-16.1 19.5-16.1s17.7 5.9 19.5 16.1" />
          <path class="teacher-collar" d="m25.5 42 6.5 6 6.5-6" />
        </svg>
      </div>
    </section>
    <section class="stats-grid dashboard-summary-grid">
      ${statCard("Profile aktive", state.students.length, "Nxënës të regjistruar", "profiles")}
      ${importantDatesCard(state.calendarEvents || [])}
    </section>
    <section class="dashboard-grid">
      <article class="glass-card">
        <div class="card-header">
          <div>
            <h3>Objektivat e ditës</h3>
            <p class="edit-hint">Klikoni mbi një objektiv për ta ndryshuar.</p>
          </div>
        </div>
        <ul class="clean-list editable-goals">
          ${student.immediateObjectives.map((goal, index) => {
            const completed = state.completedGoals.has(index);
            return `
            <li class="${completed ? "is-complete" : ""}">
              <button
                class="goal-check"
                type="button"
                data-action="toggle-dashboard-goal"
                data-goal-index="${index}"
                aria-pressed="${completed}"
                aria-label="${completed ? "Shëno si të pakryer" : "Shëno si të kryer"}: Objektivi ${index + 1}"
              ></button>
              <span contenteditable="true" role="textbox" aria-label="Objektivi ${index + 1}" data-dashboard-goal="${index}">${goal}</span>
            </li>
          `;
          }).join("")}
        </ul>
      </article>
      <article class="glass-card">
        <div class="card-header">
          <h3>Aktivitetet e fundit</h3>
        </div>
        <ul class="activity-list">
          ${state.activity.map((item) => `<li><strong>${item.title}</strong><span>${item.detail}</span></li>`).join("")}
        </ul>
      </article>
    </section>
  `;
}

function importantDatesCard(events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter((event) => new Date(`${event.date}T00:00:00`) >= today)
    .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`))
    .slice(0, 4);
  return `<article class="stat-card important-dates-card">
    <div class="important-dates-heading"><h3>Datat e Rëndësishme</h3></div>
    <ul>${upcoming.length ? upcoming.map((event) => `<li><strong>${escapeDashboardText(event.title)}</strong><small>${formatEventDate(event.date)}${event.time ? `, ${event.time}` : ""}</small></li>`).join("") : `<li class="important-date-empty">Nuk ka data të planifikuara.</li>`}</ul>
  </article>`;
}

function formatEventDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  const months = ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"];
  return `${String(parsed.getDate()).padStart(2, "0")} ${months[parsed.getMonth()]}`;
}

function escapeDashboardText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function statCard(label, value, detail, icon) {
  const icons = {
    profiles: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>`,
    objectives: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
        <path d="m15.5 8.5 4-4M16.5 4.5h3v3" />
      </svg>`
  };

  return `
    <article class="stat-card">
      <div class="stat-card-copy">
        <p>${label}</p>
        <strong data-counter="${value}">${value}</strong>
        <span>${detail}</span>
      </div>
      <span class="stat-card-icon">${icons[icon]}</span>
    </article>
  `;
}
