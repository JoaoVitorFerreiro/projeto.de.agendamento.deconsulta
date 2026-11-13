const API = window.VIDASAUDE_API_URL || "/api";
const CONVENIOS = [
  { value: "Santa Saúde", theme: "santa", mark: "✦" },
  { value: "Unimed", theme: "unimed", mark: "✚" },
  { value: "Particular", theme: "particular", mark: "✚" },
];
const WEEKDAYS = [
  { key: "MONDAY", label: "Segunda-feira", short: "Seg" },
  { key: "TUESDAY", label: "Terça-feira", short: "Ter" },
  { key: "WEDNESDAY", label: "Quarta-feira", short: "Qua" },
  { key: "THURSDAY", label: "Quinta-feira", short: "Qui" },
  { key: "FRIDAY", label: "Sexta-feira", short: "Sex" },
  { key: "SATURDAY", label: "Sábado", short: "Sáb" },
  { key: "SUNDAY", label: "Domingo", short: "Dom" },
];
let csrfToken = null;
const state = {
  view: "agenda",
  date: localToday(),
  patients: [],
  appointments: [],
  schedule: { horarioInicio: "09:00", horarioFim: "18:00", intervaloMinutos: 15 },
  scheduleDraft: null,
  settingsDay: "MONDAY",
  report: { pacientesCadastrados: 0, consultasRealizadas: 0, retornos: 0, cancelamentos: 0 },
  user: null,
  authMode: "login",
  search: "",
  agendaPatientSearch: "",
  error: "",
  modal: null,
};

const main = document.querySelector("#main");
const dialog = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const labels = { agenda: "Painel principal", pacientes: "Pacientes", relatorios: "Relatórios", canceladas: "Consultas canceladas", configuracoes: "Configurações" };

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function hhmm(value = "") { return String(value).slice(0, 5); }
function prettyDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
function shortDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
function patientAge(value) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age >= 0 ? `${age} anos` : "—";
}
function statusLabel(value) {
  return ({ agendado: "Agendado", "em atendimento": "Em atendimento", "concluído": "Concluído", cancelado: "Cancelado" })[value] || value;
}
function statusClass(value) {
  return ({ agendado: "agendado", "em atendimento": "em-atendimento", "concluído": "concluido", cancelado: "cancelado" })[value] || "";
}
function weekdayKey(date) {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(`${date}T12:00:00`).getDay()];
}
function normalizeSchedule(schedule) {
  const days = Object.fromEntries(WEEKDAYS.map(({ key }) => {
    const configured = schedule.diasFuncionamento?.[key];
    return [key, configured || {
      aberto: key !== "SATURDAY" && key !== "SUNDAY",
      horarioInicio: schedule.horarioInicio || "09:00",
      horarioFim: schedule.horarioFim || "18:00",
    }];
  }));
  return { ...schedule, diasFuncionamento: days };
}
function scheduleForDay(date, schedule = state.schedule) {
  return normalizeSchedule(schedule).diasFuncionamento[weekdayKey(date)];
}
function isClinicOpen(date) { return Boolean(scheduleForDay(date).aberto); }
function getSlots(date = state.date) {
  const daySchedule = scheduleForDay(date);
  if (!daySchedule.aberto) return [];
  const start = hhmm(daySchedule.horarioInicio || "09:00").split(":").map(Number);
  const end = hhmm(daySchedule.horarioFim || "18:00").split(":").map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  const interval = Number(state.schedule.intervaloMinutos) || 15;
  const slots = [];
  for (let minute = startMinutes; minute < endMinutes; minute += interval) {
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return slots;
}
function patient(id) { return state.patients.find((item) => item.id === id); }
function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

async function request(path, options = {}) {
  let response;
  const method = (options.method || "GET").toUpperCase();
  const headers = { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfToken) {
      const csrfResponse = await fetch(`${API}/auth/csrf`, { credentials: "include", headers: { Accept: "application/json" } });
      const csrfBody = await csrfResponse.json().catch(() => null);
      if (!csrfResponse.ok || !csrfBody?.token) throw new Error("Não foi possível iniciar uma operação segura. Atualize a página e tente novamente.");
      csrfToken = csrfBody.token;
    }
    headers["X-XSRF-TOKEN"] = csrfToken;
  }
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Inicie o backend Spring Boot em http://localhost:8080.");
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 403) csrfToken = null;
    const error = new Error(body?.mensagem || body?.message || (response.status === 401 ? "E-mail ou senha incorretos." : "Não foi possível concluir a operação."));
    error.status = response.status;
    throw error;
  }
  if (path === "/auth/login" || path === "/auth/register" || path === "/auth/logout") csrfToken = null;
  return body;
}

async function refresh() {
  try {
    const [patients, appointments, schedule, report] = await Promise.all([
      request("/pacientes"), request("/agendamentos"), request("/configuracoes/agenda"), request("/relatorios"),
    ]);
    state.patients = patients;
    state.appointments = appointments;
    state.schedule = schedule;
    state.scheduleDraft = normalizeSchedule(schedule);
    state.report = report;
    state.error = "";
    const todayHours = scheduleForDay(localToday(), state.schedule);
    document.querySelector("#sidebar-hours").textContent = todayHours.aberto
      ? `${hhmm(todayHours.horarioInicio)} às ${hhmm(todayHours.horarioFim)}` : "Fechado hoje";
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      renderLogin();
      return;
    }
    state.error = error.message;
  }
  render();
}

function toastMessage(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastMessage.timer);
  toastMessage.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function errorBanner() {
  return state.error ? `<div class="error-banner" role="alert"><span>${escapeHtml(state.error)}</span><button class="button secondary small" data-action="retry">Tentar novamente</button></div>` : "";
}

function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function stat(label, value, note, symbol) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon" aria-hidden="true">${symbol}</span></div><div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div></article>`;
}

function badge(status) { return `<span class="badge ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`; }

function render() {
  document.body.classList.remove("auth-view");
  document.querySelector("#topbar-label").textContent = labels[state.view];
  document.querySelector(".user-label strong").textContent = state.user?.nome || "Equipe clínica";
  document.querySelector(".user-label small").textContent = state.user?.email || "Minha conta";
  document.querySelector(".user-avatar").textContent = (state.user?.nome || "VS").slice(0, 2).toUpperCase();
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const view = ({ agenda: renderAgenda, pacientes: renderPatients, relatorios: renderReports, canceladas: renderCancelled, configuracoes: renderSettings })[state.view];
  main.innerHTML = `${errorBanner()}${view()}`;
}

function renderLogin(message = "") {
  document.body.classList.add("auth-view");
  const registering = state.authMode === "register";
  main.innerHTML = `<section class="auth-card"><div class="auth-brand"><span class="brand-mark">✚</span><span><strong>VidaSaúde</strong><small>Clínica Médica</small></span></div><p class="auth-eyebrow">GESTÃO DO CONSULTÓRIO</p><h1>${registering ? "Crie sua conta" : "Acesse sua clínica"}</h1><p class="auth-description">${registering ? "Cadastre-se para organizar sua agenda e seus pacientes." : "Entre para consultar a agenda e gerenciar seus pacientes."}</p><form id="auth-form" class="modal-body">${registering ? `<label class="form-field">Nome completo<input class="field" name="nome" required maxlength="100" autocomplete="name" /></label>` : ""}<label class="form-field">E-mail<input class="field" type="email" name="email" required maxlength="255" autocomplete="email" /></label><label class="form-field">Senha<input class="field" type="password" name="senha" required minlength="${registering ? 8 : 1}" maxlength="72" autocomplete="${registering ? "new-password" : "current-password"}" />${registering ? `<small class="field-hint">Use pelo menos 8 caracteres.</small>` : ""}</label>${message ? `<div class="modal-error" role="alert">${escapeHtml(message)}</div>` : ""}<button class="button auth-submit" type="submit">${registering ? "Criar conta" : "Entrar"}</button></form><p class="auth-toggle">${registering ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button data-action="auth-toggle">${registering ? "Entrar" : "Criar conta"}</button></p></section>`;
}

function renderAgenda() {
  const day = state.appointments.filter((item) => item.data === state.date);
  const active = day.filter((item) => item.status !== "cancelado");
  const slots = getSlots();
  const closed = !isClinicOpen(state.date);
  const next = state.appointments.filter((item) => item.status !== "cancelado" && item.data >= localToday())
    .sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))[0];
  const newPatients = active.filter((item) => item.tipo === "consulta").length;
  const returns = active.filter((item) => item.tipo === "retorno").length;
  const occupancy = closed || !slots.length ? 0 : Math.round(active.length / slots.length * 100);
  const greetingName = (state.user?.nome || "equipe").trim().split(/\s+/)[0];
  const slotsMarkup = closed
    ? `<div class="empty-state">A clínica está fechada nesta data. Escolha outro dia para consultar os horários.</div>`
    : `<div class="slot-list">${slots.map((time) => {
      const appointment = active.find((item) => hhmm(item.hora) === time);
      const person = appointment && patient(appointment.pacienteId);
      const slotClass = appointment?.status === "concluído" ? "done" : appointment ? "booked" : "";
       return `<div class="slot ${slotClass}"><strong class="slot-time">${time}</strong>${appointment ? badge(appointment.status) : ""}<div class="slot-person">${appointment ? `<strong>${escapeHtml(person?.nomeCompleto || appointment.pacienteNome || "Paciente")}</strong><small>${escapeHtml(appointment.tipo)}${person?.telefone ? ` · ${escapeHtml(person.telefone)}` : ""}</small>` : `<span class="slot-availability"><i aria-hidden="true"></i>Disponível</span>`}</div><button class="button ${appointment ? "secondary" : ""} small slot-action" data-action="${appointment ? "appointment-detail" : "book"}" ${appointment ? `data-id="${appointment.id}"` : `data-time="${time}"`}>${appointment ? "Detalhes" : "+ Agendar"}</button></div>`;
    }).join("")}</div>`;
  return `${heading(`Olá, ${escapeHtml(greetingName)}!`, "Aqui está o resumo da sua agenda de hoje.", `<button class="button" data-action="book">＋ Novo agendamento</button>`)}
    <section class="stats-grid" aria-label="Resumo da agenda">
      ${stat("Total de consultas", active.length, `${day.filter((a) => a.status === "concluído").length} concluídas`, "▦")}
      ${stat("Consultas normais", newPatients, "na data selecionada", "♙")}
      ${stat("Retornos", returns, "na data selecionada", "↻")}
      ${stat("Cancelamentos", day.filter((a) => a.status === "cancelado").length, "na data selecionada", "⊗")}
      ${stat("Próxima consulta", next ? hhmm(next.hora) : "—", next ? shortDate(next.data) : "Nenhuma prevista", "◷")}
      ${stat("Taxa de ocupação", `${occupancy}%`, `${active.length}/${closed ? 0 : slots.length} horários`, "◔")}
    </section>
    <div class="agenda-grid"><section class="panel"><div class="panel-heading"><h2>▦ &nbsp;Agenda de consultas</h2><div class="date-controls"><button class="icon-button" data-action="day-step" data-step="-1" aria-label="Dia anterior">‹</button><input class="field compact" id="agenda-date" type="date" value="${state.date}" aria-label="Selecionar data" /><button class="icon-button" data-action="day-step" data-step="1" aria-label="Próximo dia">›</button><button class="button link today-button" data-action="today">Hoje</button></div></div><div class="day-caption"><span>${escapeHtml(prettyDate(state.date))}</span><span>${closed ? "Consultório fechado" : `${slots.length} horários`}</span></div>${!closed ? `<div class="agenda-helper"><span class="availability-dot" aria-hidden="true"></span>Escolha <strong>+ Agendar</strong> em um horário livre para buscar o paciente.</div>` : ""}${slotsMarkup}</section>
    <aside class="side-stack">${renderAgendaPatientSearch()}<section class="panel side-panel"><div class="side-panel-heading"><h2>Pacientes do dia <span class="muted-text">(${active.length})</span></h2><button class="button link" data-view="pacientes">Ver todos</button></div><div class="patient-day">${active.length ? active.slice().sort((a,b) => a.hora.localeCompare(b.hora)).map((appointment) => `<button class="patient-day-item" data-action="appointment-detail" data-id="${appointment.id}"><span class="patient-initial">${escapeHtml((appointment.pacienteNome || patient(appointment.pacienteId)?.nomeCompleto || "P").slice(0, 1).toUpperCase())}</span><span class="patient-day-name"><strong>${escapeHtml(appointment.pacienteNome || patient(appointment.pacienteId)?.nomeCompleto || "Paciente")}</strong><small>${escapeHtml(appointment.tipo)}</small></span><span class="patient-day-time">${hhmm(appointment.hora)}</span></button>`).join("") : `<p class="empty-state">Nenhuma consulta nesta data.</p>`}</div></section><button class="button side-book-button" data-action="book"><span aria-hidden="true">＋</span> Novo agendamento <span aria-hidden="true">›</span></button></aside></div>`;
}

function renderAgendaPatientSearch() {
  const term = normalizeSearch(state.agendaPatientSearch);
  const results = term ? state.patients.filter((item) => normalizeSearch(`${item.nomeCompleto} ${item.telefone} ${item.convenio}`).includes(term)).slice(0, 5) : [];
  return `<section class="panel side-panel agenda-patient-search"><h2><span class="search-title-icon" aria-hidden="true">⌕</span> Buscar paciente</h2><input class="field" id="agenda-patient-search" type="search" autocomplete="off" value="${escapeHtml(state.agendaPatientSearch)}" placeholder="Nome, telefone ou convênio..." aria-label="Buscar paciente para agendamento" />${term ? `<div class="agenda-patient-results">${results.length ? results.map((item) => `<button class="agenda-patient-result" data-action="agenda-patient-book" data-id="${item.id}"><span class="patient-initial">${escapeHtml((item.nomeCompleto || "P").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(item.nomeCompleto)}</strong><small>${escapeHtml(item.telefone)} · Agendar</small></span><span aria-hidden="true">›</span></button>`).join("") : `<p class="patient-search-empty">Nenhum paciente encontrado.</p>`}${results.length === 5 ? `<p class="patient-search-hint">Digite mais para refinar a busca.</p>` : ""}</div>` : ""}</section>`;
}

function renderPatients() {
  const term = state.search.trim().toLocaleLowerCase("pt-BR");
  const filtered = state.patients.filter((item) => `${item.nomeCompleto} ${item.telefone} ${item.convenio}`.toLocaleLowerCase("pt-BR").includes(term));
  return `${heading("Pacientes", `${state.patients.length} pacientes cadastrados`, `<button class="button" data-action="new-patient">＋ Novo paciente</button>`)}
    <section class="panel patient-list"><div class="list-toolbar"><input class="field" id="patient-search" type="search" value="${escapeHtml(state.search)}" placeholder="Buscar por nome, telefone ou convênio" aria-label="Buscar pacientes" /></div>
    ${filtered.length ? filtered.map((item) => {
      const completed = state.appointments.filter((a) => a.pacienteId === item.id && a.status === "concluído").length;
      return `<div class="patient-row"><span class="patient-initial">${escapeHtml((item.nomeCompleto || "P").slice(0, 1).toUpperCase())}</span><div class="patient-row-info"><strong>${escapeHtml(item.nomeCompleto)}</strong><small>${escapeHtml(item.telefone)} · ${escapeHtml(item.convenio || "Sem convênio")}</small></div><span class="patient-count">${completed} consultas realizadas</span><button class="button secondary small" data-action="patient-detail" data-id="${item.id}">Ver histórico</button><button class="button small" data-action="patient-record" data-id="${item.id}"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3.5" y="3" width="13" height="15" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M7 3.5h6v3H7zM7 10h6M7 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Ficha do paciente</button></div>`;
    }).join("") : `<div class="empty-state">Nenhum paciente encontrado.</div>`}</section>`;
}

function renderCancelled() {
  const items = state.appointments.filter((item) => item.status === "cancelado").sort((a, b) => `${b.data}${b.hora}`.localeCompare(`${a.data}${a.hora}`));
  return `${heading("Consultas canceladas", "Histórico de cancelamentos e possibilidade de remarcar.")}
    <section class="panel cancel-list">${items.length ? items.map((item) => `<div class="cancel-row"><span class="stat-icon">⊗</span><div class="cancel-info"><strong>${escapeHtml(item.pacienteNome || patient(item.pacienteId)?.nomeCompleto || "Paciente")}</strong><small>${shortDate(item.data)} às ${hhmm(item.hora)} · ${escapeHtml(item.tipo)}</small>${item.motivoCancelamento ? `<div class="cancel-reason">Motivo: ${escapeHtml(item.motivoCancelamento)}</div>` : ""}</div>${badge("cancelado")}<button class="button secondary small" data-action="reschedule" data-id="${item.id}">↻ Remarcar</button></div>`).join("") : `<div class="empty-state">Nenhuma consulta cancelada.</div>`}</section>`;
}

function renderReports() {
  const recent = state.appointments.slice().sort((a,b) => `${b.data}${b.hora}`.localeCompare(`${a.data}${a.hora}`)).slice(0, 10);
  return `${heading("Relatórios", "Visão geral dos atendimentos e da clínica.")}
    <section class="report-grid">${[
      ["Pacientes cadastrados", state.report.pacientesCadastrados, "♙"],
      ["Consultas realizadas", state.report.consultasRealizadas, "✓"],
      ["Retornos", state.report.retornos, "↻"],
      ["Cancelamentos", state.report.cancelamentos, "⊗"],
    ].map(([label, value, icon]) => `<article class="panel report-card"><span class="stat-icon">${icon}</span><div class="stat-value">${value}</div><p>${label}</p></article>`).join("")}</section>
    <section class="panel"><div class="panel-heading"><h2>Atendimentos recentes</h2></div>${recent.length ? recent.map((item) => `<div class="recent-row"><span>${escapeHtml(item.pacienteNome || patient(item.pacienteId)?.nomeCompleto || "Paciente")}</span><span class="muted">${shortDate(item.data)} · ${hhmm(item.hora)}</span>${badge(item.status)}</div>`).join("") : `<div class="empty-state">Ainda não há consultas registradas.</div>`}</section>`;
}

function renderSettings() {
  const draft = state.scheduleDraft || normalizeSchedule(state.schedule);
  const dayKey = WEEKDAYS.some((day) => day.key === state.settingsDay) ? state.settingsDay : "MONDAY";
  state.settingsDay = dayKey;
  const selectedDay = draft.diasFuncionamento[dayKey];
  const openDays = WEEKDAYS.filter(({ key }) => draft.diasFuncionamento[key]?.aberto);
  return `${heading("Configurações", "Defina os dias e horários em que sua clínica atende.")}
    <form id="settings-form" class="panel settings-panel"><div class="settings-heading"><span class="settings-heading-icon" aria-hidden="true">◷</span><div><h2>Horários de funcionamento</h2><p>Personalize os dias de atendimento e os horários para cada dia.</p></div></div>
      <div class="settings-section"><label class="form-field">Intervalo entre consultas<select class="field" name="intervaloMinutos"><option value="15" ${Number(draft.intervaloMinutos) === 15 ? "selected" : ""}>15 minutos</option><option value="30" ${Number(draft.intervaloMinutos) === 30 ? "selected" : ""}>30 minutos</option><option value="60" ${Number(draft.intervaloMinutos) === 60 ? "selected" : ""}>60 minutos</option></select></label></div>
      <div class="settings-section"><div class="settings-section-heading"><div><h3>Dias de atendimento</h3><p>Marque os dias em que a clínica estará aberta.</p></div><span class="settings-day-count">${openDays.length} de 7 dias</span></div><div class="weekday-toggle-grid" role="group" aria-label="Dias em que a clínica funciona">${WEEKDAYS.map(({ key, short }) => `<label class="weekday-toggle ${draft.diasFuncionamento[key]?.aberto ? "is-open" : ""}"><input type="checkbox" data-open-day="${key}" ${draft.diasFuncionamento[key]?.aberto ? "checked" : ""} /><span>${short}</span></label>`).join("")}</div></div>
      <div class="settings-section"><label class="form-field" for="settings-day">Configurar horário de<select class="field" id="settings-day">${WEEKDAYS.map(({ key, label }) => `<option value="${key}" ${key === dayKey ? "selected" : ""}>${label}${draft.diasFuncionamento[key]?.aberto ? " · Aberto" : " · Fechado"}</option>`).join("")}</select></label><div class="form-grid settings-hours-grid"><label class="form-field">Início (${WEEKDAYS.find((day) => day.key === dayKey).label})<input class="field" id="settings-day-start" type="time" value="${hhmm(selectedDay.horarioInicio || draft.horarioInicio || "09:00")}" ${selectedDay.aberto ? "required" : "disabled"} /></label><label class="form-field">Fim (${WEEKDAYS.find((day) => day.key === dayKey).label})<input class="field" id="settings-day-end" type="time" value="${hhmm(selectedDay.horarioFim || draft.horarioFim || "18:00")}" ${selectedDay.aberto ? "required" : "disabled"} /></label></div><p class="settings-day-status ${selectedDay.aberto ? "is-open" : ""}">${selectedDay.aberto ? "Este dia está aberto para agendamentos." : "Este dia está fechado e não exibirá horários para agendamento."}</p></div>
      <div class="settings-summary"><strong>Dias abertos:</strong> <span>${openDays.length ? openDays.map(({ short }) => short).join(" · ") : "Nenhum dia selecionado"}</span></div><p class="settings-note">Alterar os horários não modifica consultas que já estão agendadas.</p><div class="form-actions"><button class="button" type="submit">Salvar configurações</button></div></form>`;
}

function updateSettingsDayControls() {
  const draft = state.scheduleDraft || normalizeSchedule(state.schedule);
  state.scheduleDraft = draft;
  const openDays = WEEKDAYS.filter(({ key }) => draft.diasFuncionamento[key]?.aberto);
  document.querySelectorAll("[data-open-day]").forEach((input) => {
    const isOpen = Boolean(draft.diasFuncionamento[input.dataset.openDay]?.aberto);
    input.checked = isOpen;
    input.closest(".weekday-toggle")?.classList.toggle("is-open", isOpen);
  });
  const count = document.querySelector(".settings-day-count");
  if (count) count.textContent = `${openDays.length} de 7 dias`;
  const summary = document.querySelector(".settings-summary span");
  if (summary) summary.textContent = openDays.length ? openDays.map(({ short }) => short).join(" · ") : "Nenhum dia selecionado";
  const select = document.querySelector("#settings-day");
  if (select) WEEKDAYS.forEach(({ key, label }) => {
    const option = select.querySelector(`option[value="${key}"]`);
    if (option) option.textContent = `${label} · ${draft.diasFuncionamento[key]?.aberto ? "Aberto" : "Fechado"}`;
  });
  const day = draft.diasFuncionamento[state.settingsDay];
  const start = document.querySelector("#settings-day-start");
  const end = document.querySelector("#settings-day-end");
  const status = document.querySelector(".settings-day-status");
  if (start) { start.disabled = !day?.aberto; start.required = Boolean(day?.aberto); }
  if (end) { end.disabled = !day?.aberto; end.required = Boolean(day?.aberto); }
  if (status) {
    status.classList.toggle("is-open", Boolean(day?.aberto));
    status.textContent = day?.aberto
      ? "Este dia está aberto para agendamentos."
      : "Este dia está fechado e não exibirá horários para agendamento.";
  }
}

function captureSettingsDay(form) {
  const day = state.scheduleDraft.diasFuncionamento[state.settingsDay];
  const start = form.querySelector("#settings-day-start");
  const end = form.querySelector("#settings-day-end");
  if (start?.value) day.horarioInicio = start.value;
  if (end?.value) day.horarioFim = end.value;
}

function showModal(content, modalState) {
  state.modal = modalState;
  dialog.classList.toggle("patient-record-dialog", modalState?.type === "patient-record");
  dialog.classList.toggle("patient-form-dialog", modalState?.type === "patient-form");
  dialog.innerHTML = content;
  if (!dialog.open) dialog.showModal();
}

function closeModal() {
  if (dialog.open) dialog.close();
  state.modal = null;
}

function modalShell(title, subtitle, body) {
  return `<div class="modal-content"><header class="modal-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header>${body}</div>`;
}

function bookingPatientResultsMarkup(query = "", selectedPatientId = "") {
  const term = normalizeSearch(query);
  const matches = state.patients.filter((item) => !term
    || normalizeSearch(`${item.nomeCompleto} ${item.telefone} ${item.convenio}`).includes(term));
  const visible = matches.slice(0, 8);
  if (!visible.length) return `<p class="patient-picker-empty">Nenhum paciente encontrado. Confira o nome ou telefone e tente novamente.</p>`;
  return `${visible.map((item) => `<button type="button" class="patient-picker-option" role="option" aria-selected="${String(item.id) === String(selectedPatientId)}" data-action="choose-booking-patient" data-id="${item.id}"><span class="patient-picker-avatar" aria-hidden="true">${escapeHtml((item.nomeCompleto || "P").slice(0, 1).toUpperCase())}</span><span class="patient-picker-details"><strong>${escapeHtml(item.nomeCompleto)}</strong><small>${escapeHtml(item.telefone)} · ${escapeHtml(item.convenio || "Sem convênio")}</small></span><span class="patient-picker-choice">${String(item.id) === String(selectedPatientId) ? "Selecionado" : "Selecionar"}</span></button>`).join("")}${matches.length > visible.length ? `<p class="patient-picker-hint">Mostrando 8 de ${matches.length}. Digite mais para refinar.</p>` : ""}`;
}

function bookingPatientPickerMarkup(selectedPatientId = "", query = "") {
  const selected = patient(Number(selectedPatientId)) || patient(selectedPatientId);
  return `<div class="patient-picker"><label class="form-field" for="booking-patient-search">Paciente *</label><div class="patient-picker-search"><span aria-hidden="true">⌕</span><input class="field" id="booking-patient-search" type="search" autocomplete="off" autofocus aria-required="true" placeholder="Buscar por nome, telefone ou convênio" value="${escapeHtml(query)}" role="combobox" aria-autocomplete="list" aria-controls="booking-patient-results" aria-expanded="true" ${!state.patients.length ? "disabled" : ""} /></div><input type="hidden" id="booking-patient-id" name="pacienteId" value="${selected ? selected.id : ""}" /><div class="patient-picker-selection" id="booking-patient-selection" aria-live="polite">${selected ? `<span class="selection-check" aria-hidden="true">✓</span><span><small>Paciente selecionado</small><strong>${escapeHtml(selected.nomeCompleto)}</strong><small>${escapeHtml(selected.telefone)}</small></span><button class="button link" type="button" data-action="clear-booking-patient">Trocar</button>` : `<span class="selection-placeholder">Digite para buscar ou selecione um paciente da lista.</span>`}</div><div class="patient-picker-results" id="booking-patient-results" role="listbox" aria-label="Resultados da busca de pacientes">${bookingPatientResultsMarkup(query, selectedPatientId)}</div></div>`;
}

function renderBookingPatientResults() {
  const input = document.querySelector("#booking-patient-search");
  const results = document.querySelector("#booking-patient-results");
  if (!input || !results) return;
  results.innerHTML = bookingPatientResultsMarkup(input.value, state.modal?.patientId);
  input.setAttribute("aria-expanded", "true");
}

function renderBookingPatientSelection() {
  const selection = document.querySelector("#booking-patient-selection");
  const hidden = document.querySelector("#booking-patient-id");
  if (!selection || !hidden) return;
  const selected = patient(Number(state.modal?.patientId)) || patient(state.modal?.patientId);
  hidden.value = selected?.id || "";
  selection.innerHTML = selected
    ? `<span class="selection-check" aria-hidden="true">✓</span><span><small>Paciente selecionado</small><strong>${escapeHtml(selected.nomeCompleto)}</strong><small>${escapeHtml(selected.telefone)}</small></span><button class="button link" type="button" data-action="clear-booking-patient">Trocar</button>`
    : `<span class="selection-placeholder">Digite para buscar ou selecione um paciente da lista.</span>`;
}

function openBooking(date = state.date, time = "", patientId = "", patientQuery = "") {
  if (date < localToday()) date = localToday();
  const chosenPatient = patientId || "";
  const occupied = state.appointments.filter((item) => item.data === date && item.status !== "cancelado").map((item) => hhmm(item.hora));
  const options = getSlots(date).filter((slot) => !occupied.includes(slot) || slot === time);
  const dayIsOpen = isClinicOpen(date);
  showModal(modalShell("Novo agendamento", "Escolha um paciente, uma data e um horário disponível.", `<form id="booking-form" class="modal-body">
    ${bookingPatientPickerMarkup(chosenPatient, patientQuery)}
    ${!state.patients.length ? `<p class="muted-text">Ainda não há pacientes cadastrados. Cadastre um paciente para liberar o agendamento.</p>` : ""}
    <div class="form-grid"><label class="form-field">Data da consulta<input class="field" type="date" name="data" min="${localToday()}" value="${date}" required /></label><label class="form-field">Horário disponível<select class="field" name="hora" required ${!dayIsOpen || !options.length ? "disabled" : ""}><option value="">${!dayIsOpen ? "Clínica fechada nesta data" : "Selecione um horário"}</option>${options.map((slot) => `<option value="${slot}" ${slot === time ? "selected" : ""}>${slot}</option>`).join("")}</select>${!options.length ? `<small class="field-hint">${dayIsOpen ? "Não há horários livres nesta data." : "Escolha uma data em que a clínica esteja aberta."}</small>` : ""}</label></div>
    <button class="button link" type="button" data-action="new-patient-from-booking">＋ Cadastrar novo paciente</button><div id="modal-error"></div><div class="form-actions"><button class="button secondary" type="button" data-action="close-modal">Cancelar</button><button class="button" type="submit" ${!state.patients.length ? "disabled" : ""}>Agendar consulta</button></div>
  </form>`), { type: "booking", date, time, patientId: chosenPatient, patientQuery });
}

function openPatientForm(item = null, afterBooking = false) {
  const current = item || {};
  const civilStatuses = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)", "Outro"];
  showModal(modalShell(item ? "Editar paciente" : "Cadastrar paciente", "Dados do paciente para consultas e histórico.", `<form id="patient-form" class="modal-body patient-form">
    <label class="form-field">Nome completo *<input class="field" name="nomeCompleto" required maxlength="120" autocomplete="name" autofocus value="${escapeHtml(current.nomeCompleto || "")}" /></label>
    <label class="form-field">Telefone *<input class="field" name="telefone" required maxlength="30" autocomplete="tel" placeholder="(00) 00000-0000" value="${escapeHtml(current.telefone || "")}" /></label>
    <fieldset class="convenio-fieldset"><legend>Convênio *</legend><div class="convenio-options">${CONVENIOS.map(({ value, theme, mark }) => `<label class="convenio-card ${current.convenio === value ? "selected" : ""}"><input type="radio" name="convenio" value="${escapeHtml(value)}" required ${current.convenio === value ? "checked" : ""} /><span class="convenio-logo ${theme}"><span aria-hidden="true">${mark}</span><strong>${escapeHtml(value)}</strong></span><span class="convenio-label">${escapeHtml(value)}</span></label>`).join("")}</div></fieldset>
    <div class="form-grid"><label class="form-field">Nascimento<input class="field" name="dataNascimento" type="date" autocomplete="bday" value="${escapeHtml(current.dataNascimento || "")}" /></label><label class="form-field">E-mail<input class="field" name="email" type="email" maxlength="255" autocomplete="email" placeholder="nome@email.com" value="${escapeHtml(current.email || "")}" /></label>
    <label class="form-field full">Endereço<input class="field" name="endereco" maxlength="255" autocomplete="street-address" placeholder="Rua, número, bairro, cidade" value="${escapeHtml(current.endereco || "")}" /></label>
    <label class="form-field">Naturalidade<input class="field" name="naturalidade" maxlength="100" placeholder="Cidade / UF" value="${escapeHtml(current.naturalidade || "")}" /></label><label class="form-field">Estado civil<select class="field" name="estadoCivil"><option value="">Selecione</option>${civilStatuses.map((value) => `<option value="${value}" ${current.estadoCivil === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
    <label class="form-field full">Observações<textarea class="field" name="observacao" rows="3" maxlength="2000" placeholder="Informações importantes sobre o paciente">${escapeHtml(current.observacao || "")}</textarea></label></div><div id="modal-error"></div><button class="button patient-save-button" type="submit">${item ? "Salvar paciente" : "Salvar paciente"}</button>
  </form>`), { type: "patient-form", id: item?.id || null, afterBooking, booking: state.modal?.type === "booking" ? state.modal : null });
}

function patientRecordField(icon, label, value) {
  return `<div class="patient-record-field"><span class="record-field-icon" aria-hidden="true">${icon}</span><span class="record-field-label">${label}:</span><strong>${escapeHtml(value || "Não informado")}</strong></div>`;
}

function openPatientRecord(id) {
  const current = patient(Number(id)) || patient(id);
  if (!current) return toastMessage("Paciente não encontrado.");
  const content = `<div class="patient-record-sheet">
    <header class="patient-record-heading"><span class="patient-record-logo" aria-hidden="true">✚</span><div class="patient-record-title"><span>VIDASAÚDE · CLÍNICA MÉDICA</span><h2>FICHA DE CADASTRO<br />DE PACIENTE</h2></div><svg class="patient-record-pulse" viewBox="0 0 210 60" fill="none" aria-hidden="true"><path d="M0 32h62l10-2 8-15 9 33 13-49 14 49 10-23 8 12 8-5h68" /></svg></header>
    <div class="patient-record-grid">${patientRecordField("♙", "Nome completo", current.nomeCompleto)}${patientRecordField("▦", "Data de nascimento", current.dataNascimento ? shortDate(current.dataNascimento) : "Não informado")}${patientRecordField("⌂", "Endereço", current.endereco)}${patientRecordField("☎", "Telefone", current.telefone)}${patientRecordField("▤", "Convênio", current.convenio)}${patientRecordField("⌖", "Naturalidade", current.naturalidade)}${patientRecordField("♡", "Estado civil", current.estadoCivil)}${patientRecordField("♙", "Idade", patientAge(current.dataNascimento))}</div>
  </div>`;
  showModal(modalShell("Ficha do paciente", escapeHtml(current.nomeCompleto), `<div class="patient-record-content">${content}<div class="form-actions patient-record-actions"><button class="button secondary" data-action="patient-detail" data-id="${current.id}">Ver histórico</button><button class="button secondary" data-action="edit-patient" data-id="${current.id}">Editar cadastro</button><button class="button" data-action="print-patient-record">Imprimir ficha</button></div></div>`), { type: "patient-record", id: current.id });
}

async function openPatientDetail(id) {
  const current = patient(Number(id)) || patient(id);
  if (!current) return toastMessage("Paciente não encontrado.");
  showModal(modalShell(escapeHtml(current.nomeCompleto), "Ficha cadastral e histórico de consultas.", `<div class="modal-body"><div class="detail-grid"><div><span>Telefone</span><strong>${escapeHtml(current.telefone)}</strong></div><div><span>Convênio</span><strong>${escapeHtml(current.convenio || "—")}</strong></div><div><span>Nascimento</span><strong>${current.dataNascimento ? shortDate(current.dataNascimento) : "—"}</strong></div><div><span>E-mail</span><strong>${escapeHtml(current.email || "—")}</strong></div>${current.observacao ? `<div style="grid-column:1/-1"><span>Observações</span><strong>${escapeHtml(current.observacao)}</strong></div>` : ""}</div><div><h3 class="section-title">Histórico de consultas</h3><div class="history-list" id="patient-history"><div class="empty-state">Carregando histórico…</div></div></div><div class="form-actions"><button class="button secondary" data-action="edit-patient" data-id="${current.id}">Editar ficha</button><button class="button" data-action="close-modal">Fechar</button></div></div>`), { type: "patient-detail", id: current.id });
  try {
    const history = await request(`/pacientes/${current.id}/agendamentos`);
    if (state.modal?.type !== "patient-detail" || String(state.modal.id) !== String(current.id)) return;
    const target = document.querySelector("#patient-history");
    if (target) target.innerHTML = history.length ? history.map((item) => `<div class="history-row"><span>${shortDate(item.data)} às ${hhmm(item.hora)} · ${escapeHtml(item.tipo)}</span>${badge(item.status)}</div>`).join("") : `<div class="empty-state">Nenhuma consulta registrada.</div>`;
  } catch (error) {
    const target = document.querySelector("#patient-history");
    if (target) target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function openAppointmentDetail(id) {
  const item = state.appointments.find((appointment) => String(appointment.id) === String(id));
  if (!item) return;
  const p = patient(item.pacienteId);
  const actions = item.status === "cancelado" ? `<button class="button" data-action="reschedule" data-id="${item.id}">↻ Remarcar</button>` : `<button class="button secondary" data-action="set-status" data-status="em atendimento" data-id="${item.id}">Iniciar atendimento</button><button class="button secondary" data-action="set-status" data-status="concluído" data-id="${item.id}">Marcar concluída</button><button class="button danger" data-action="cancel-appointment" data-id="${item.id}">Cancelar consulta</button>`;
  showModal(modalShell("Detalhes da consulta", "Dados do agendamento selecionado.", `<div class="modal-body"><div class="detail-grid"><div><span>Paciente</span><strong>${escapeHtml(item.pacienteNome || p?.nomeCompleto || "Paciente")}</strong></div><div><span>Telefone</span><strong>${escapeHtml(p?.telefone || "—")}</strong></div><div><span>Data e horário</span><strong>${shortDate(item.data)} às ${hhmm(item.hora)}</strong></div><div><span>Tipo / status</span><strong>${escapeHtml(item.tipo)} · ${escapeHtml(statusLabel(item.status))}</strong></div>${item.motivoCancelamento ? `<div style="grid-column:1/-1"><span>Motivo do cancelamento</span><strong>${escapeHtml(item.motivoCancelamento)}</strong></div>` : ""}</div><div class="status-actions">${actions}</div><div class="form-actions"><button class="button secondary" data-action="close-modal">Fechar</button>${p ? `<button class="button link" data-action="patient-detail" data-id="${p.id}">Ver ficha do paciente</button>` : ""}</div></div>`), { type: "appointment-detail", id: item.id });
}

function showModalError(message) {
  const element = document.querySelector("#modal-error");
  if (element) element.innerHTML = `<div class="modal-error" role="alert">${escapeHtml(message)}</div>`;
  else toastMessage(message);
}

async function changeStatus(id, status, reason = null) {
  await request(`/agendamentos/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, motivoCancelamento: reason }) });
  closeModal();
  await refresh();
  toastMessage(status === "cancelado" ? "Consulta cancelada e horário liberado." : "Status da consulta atualizado.");
}

function openCancelForm(id) {
  showModal(modalShell("Cancelar consulta?", "O cancelamento ficará no histórico e liberará o horário.", `<form id="cancel-form" class="modal-body"><input type="hidden" name="id" value="${id}" /><label class="form-field">Motivo (opcional)<textarea name="motivo" class="field" rows="3" maxlength="500" placeholder="Informe o motivo do cancelamento"></textarea></label><div id="modal-error"></div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button danger">Confirmar cancelamento</button></div></form>`), { type: "cancel", id });
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    state.view = nav.dataset.view;
    if (state.view !== "pacientes") state.search = "";
    document.querySelector("#sidebar").classList.remove("open");
    render();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { action: name, id } = action.dataset;
  try {
    if (name === "retry") await refresh();
    if (name === "auth-toggle") { state.authMode = state.authMode === "login" ? "register" : "login"; renderLogin(); }
    if (name === "logout") {
      await request("/auth/logout", { method: "POST" });
      state.user = null;
      renderLogin("Você saiu da sua conta.");
    }
    if (name === "close-modal") closeModal();
    if (name === "book") openBooking(action.dataset.time ? state.date : state.date, action.dataset.time || "");
    if (name === "choose-booking-patient" && state.modal?.type === "booking") {
      const selected = patient(Number(id)) || patient(id);
      if (selected) {
        state.modal.patientId = selected.id;
        state.modal.patientQuery = "";
        const search = document.querySelector("#booking-patient-search");
        if (search) search.value = "";
        renderBookingPatientSelection();
        renderBookingPatientResults();
      }
    }
    if (name === "clear-booking-patient" && state.modal?.type === "booking") {
      state.modal.patientId = "";
      state.modal.patientQuery = "";
      const search = document.querySelector("#booking-patient-search");
      if (search) { search.value = ""; search.focus(); }
      renderBookingPatientSelection();
      renderBookingPatientResults();
    }
    if (name === "agenda-patient-book") openBooking(state.date, "", id);
    if (name === "new-patient") openPatientForm();
    if (name === "new-patient-from-booking") openPatientForm(null, true);
    if (name === "patient-detail") await openPatientDetail(id);
    if (name === "patient-record") openPatientRecord(id);
    if (name === "print-patient-record") window.print();
    if (name === "edit-patient") {
      const p = patient(Number(id)) || patient(id);
      if (p) openPatientForm(p);
    }
    if (name === "appointment-detail") openAppointmentDetail(id);
    if (name === "day-step") {
      const date = new Date(`${state.date}T12:00:00`);
      date.setDate(date.getDate() + Number(action.dataset.step));
      state.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      render();
    }
    if (name === "today") { state.date = localToday(); render(); }
    if (name === "set-status") await changeStatus(id, action.dataset.status);
    if (name === "cancel-appointment") openCancelForm(id);
    if (name === "reschedule") {
      const item = state.appointments.find((appointment) => String(appointment.id) === String(id));
      closeModal();
      if (item) openBooking(localToday(), "", item.pacienteId);
    }
  } catch (error) { toastMessage(error.message); }
});

document.querySelector("#menu-toggle").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#global-search").addEventListener("input", (event) => {
  state.search = event.target.value;
  if (state.search) state.view = "pacientes";
  render();
  const localSearch = document.querySelector("#patient-search");
  if (localSearch) { localSearch.focus(); localSearch.setSelectionRange(state.search.length, state.search.length); }
});
main.addEventListener("input", (event) => {
  if (event.target.id === "settings-day-start" || event.target.id === "settings-day-end") {
    const day = state.scheduleDraft?.diasFuncionamento?.[state.settingsDay];
    if (day) day[event.target.id === "settings-day-start" ? "horarioInicio" : "horarioFim"] = event.target.value;
    return;
  }
  if (event.target.id !== "patient-search" && event.target.id !== "agenda-patient-search") return;
  const inputId = event.target.id;
  const cursor = event.target.selectionStart;
  if (inputId === "patient-search") state.search = event.target.value;
  else state.agendaPatientSearch = event.target.value;
  render();
  const input = document.querySelector(`#${inputId}`);
  if (input) { input.focus(); input.setSelectionRange(cursor, cursor); }
});
main.addEventListener("change", (event) => {
  if (event.target.id === "agenda-date" && event.target.value) { state.date = event.target.value; render(); }
  if (event.target.id === "settings-day") {
    captureSettingsDay(document.querySelector("#settings-form"));
    state.settingsDay = event.target.value;
    render();
  }
  if (event.target.dataset.openDay) {
    const day = state.scheduleDraft?.diasFuncionamento?.[event.target.dataset.openDay];
    if (day) day.aberto = event.target.checked;
    updateSettingsDayControls();
  }
});
dialog.addEventListener("input", (event) => {
  if (event.target.id !== "booking-patient-search" || state.modal?.type !== "booking") return;
  state.modal.patientQuery = event.target.value;
  state.modal.patientId = "";
  renderBookingPatientSelection();
  renderBookingPatientResults();
});
dialog.addEventListener("keydown", (event) => {
  if (event.target.id !== "booking-patient-search" || event.key !== "ArrowDown") return;
  const firstResult = document.querySelector("#booking-patient-results .patient-picker-option");
  if (firstResult) { event.preventDefault(); firstResult.focus(); }
});
main.addEventListener("submit", async (event) => {
  if (event.target.id === "settings-form") {
    event.preventDefault();
    const form = event.target;
    captureSettingsDay(form);
    const values = Object.fromEntries(new FormData(form));
    state.scheduleDraft.intervaloMinutos = Number(values.intervaloMinutos);
    const firstOpenDay = WEEKDAYS.find(({ key }) => state.scheduleDraft.diasFuncionamento[key]?.aberto);
    const legacyHours = firstOpenDay ? state.scheduleDraft.diasFuncionamento[firstOpenDay.key] : state.schedule;
    const payload = {
      horarioInicio: legacyHours.horarioInicio || "09:00",
      horarioFim: legacyHours.horarioFim || "18:00",
      intervaloMinutos: Number(values.intervaloMinutos),
      diasFuncionamento: state.scheduleDraft.diasFuncionamento,
    };
    try {
      await request("/configuracoes/agenda", { method: "PUT", body: JSON.stringify(payload) });
      await refresh();
      toastMessage("Dias e horários de funcionamento salvos.");
    } catch (error) { toastMessage(error.message); }
    return;
  }
  if (event.target.id !== "auth-form") return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.target));
  const registering = state.authMode === "register";
  try {
    state.user = await request(registering ? "/auth/register" : "/auth/login", {
      method: "POST",
      body: JSON.stringify(registering ? { nome: fields.nome.trim(), email: fields.email.trim(), senha: fields.senha } : { email: fields.email.trim(), senha: fields.senha }),
    });
    await refresh();
  } catch (error) { renderLogin(error.message); }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeModal();
});
dialog.addEventListener("change", (event) => {
  if (state.modal?.type !== "booking") return;
  if (event.target.name === "data") {
    const patientId = state.modal.patientId;
    const patientQuery = state.modal.patientQuery;
    state.modal.date = event.target.value;
    openBooking(event.target.value, "", patientId, patientQuery);
  }
});
dialog.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "patient-form") {
      const current = state.modal;
      const payload = {
        nomeCompleto: values.nomeCompleto.trim(), telefone: values.telefone.trim(), convenio: values.convenio,
        dataNascimento: values.dataNascimento || null, endereco: values.endereco.trim() || null,
        naturalidade: values.naturalidade.trim() || null, estadoCivil: values.estadoCivil.trim() || null,
        email: values.email.trim() || null, observacao: values.observacao.trim() || null,
      };
      const saved = await request(current.id ? `/pacientes/${current.id}` : "/pacientes", {
        method: current.id ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      const booking = current.booking;
      const shouldBook = current.afterBooking;
      closeModal();
      await refresh();
      if (shouldBook && booking) openBooking(booking.date, booking.time, saved.id);
      else toastMessage(current.id ? "Cadastro atualizado." : "Paciente cadastrado.");
    } else if (form.id === "booking-form") {
      if (!values.pacienteId) throw new Error("Selecione um paciente nos resultados da busca antes de agendar.");
      await request("/agendamentos", { method: "POST", body: JSON.stringify({ pacienteId: Number(values.pacienteId), data: values.data, hora: values.hora }) });
      state.date = values.data;
      state.view = "agenda";
      closeModal();
      await refresh();
      toastMessage("Agendamento criado com sucesso.");
    } else if (form.id === "cancel-form") {
      await changeStatus(values.id, "cancelado", values.motivo.trim() || null);
    }
  } catch (error) { showModalError(error.message); }
});

async function boot() {
  try {
    state.user = await request("/auth/me");
    await refresh();
  } catch (error) {
    if (error.status === 401) renderLogin();
    else { state.error = error.message; renderLogin(error.message); }
  }
}

boot();
