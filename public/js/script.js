const PROJECT_REF = "lzpummcsjxlcsiqkqvwa";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6cHVtbWNzanhsY3NpcWtxdndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1ODkzODMsImV4cCI6MjEwNjE2NTM4M30.NpyLo7D-BE1VQj-H_TgEbnNjtPxnVsJxMSkrsKoLXWA";
const tableName = "students";
const supabaseClient = window.supabase?.createClient(`https://${PROJECT_REF}.supabase.co`, SUPABASE_ANON_KEY) ?? null;

const BASE_URL = `https://${PROJECT_REF}.supabase.co/rest/v1/${tableName}`;

async function getHeaders() {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in to access student records.");
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function getErrorMessage(response) {
  const text = await response.text();
  if (!text) return `HTTP error! status: ${response.status}`;

  try {
    const details = JSON.parse(text);
    return details.message || details.details || text;
  } catch {
    return text;
  }
}

async function fetchSupabaseData() {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_URL}?select=*&order=student_id.asc`, {
    method: "GET",
    headers,
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return await response.json();
}

async function insertStudentData(studentPayload) {
  const headers = await getHeaders();
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(studentPayload),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));

  const data = await response.json();
  return data[0];
}

async function updateStudentData(originalId, studentPayload) {
  const headers = await getHeaders();
  const query = new URLSearchParams({
    student_id: `eq.${originalId}`,
  });

  const response = await fetch(`${BASE_URL}?${query}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(studentPayload),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));

  const data = await response.json();
  if (!data.length) throw new Error("No matching student was found.");
  return data[0];
}

async function deleteStudentData(studentId) {
  const headers = await getHeaders();
  const query = new URLSearchParams({
    student_id: `eq.${studentId}`,
  });

  const response = await fetch(`${BASE_URL}?${query}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));

  const data = await response.json();
  if (!data.length) {
    throw new Error("No matching student was found, or you don't have permission to delete it.");
  }
}

function createManagementApp({ onShowResults }) {
  const form = document.getElementById("document");
  const registerSection = document.getElementById("registerSection");
  const table = document.getElementById("table");
  const registerStatus = document.getElementById("registerStatus");

  const firstName = document.getElementById("firstName");
  const middleName = document.getElementById("middleName");
  const surname = document.getElementById("surname");
  const studentId = document.getElementById("studentId");
  const gender = document.getElementById("gender");
  const dateOfBirth = document.getElementById("dateOfBirth");
  const age = document.getElementById("age");
  const email = document.getElementById("email");
  const phoneNumber = document.getElementById("phoneNumber");
  const course = document.getElementById("course");
  const programmeList = document.getElementById("programmeList");
  const level = document.getElementById("level");

  const STUDENT_ID_LENGTH = 8;
  const PROGRAMMES = [
    { name: "BSc Computer Science", years: 4 },
    { name: "BSc Information Technology", years: 4 },
    { name: "BSc Computer Engineering", years: 4 },
    { name: "BSc Electrical/Electronic Engineering", years: 4 },
    { name: "BSc Mathematics", years: 4 },
    { name: "BSc Statistics", years: 4 },
    { name: "BSc Physics", years: 4 },
    { name: "BSc Biochemistry", years: 4 },
    { name: "BSc Nursing", years: 4 },
    { name: "BSc Architecture", years: 5 },
    { name: "Bachelor of Laws (LLB)", years: 4 },
    { name: "Doctor of Pharmacy (PharmD)", years: 6 },
    { name: "Doctor of Medicine (MB ChB)", years: 6 },
  ];
  const DEFAULT_PROGRAMME_YEARS = 4;
  const PROGRAMME_DURATIONS = new Map(
    PROGRAMMES.map(({ name, years }) => [normalizeProgramme(name), years])
  );

  const lockedForStudents = [studentId, course, level];
  let isStaff = false;
  let loadGeneration = 0;
  const registeredIds = new Set();
  const studentRows = new Map();
  let editingStudentId = null;

  const submitButton = form.querySelector('[type="submit"]');
  function setStatus(message, type = "") {
    registerStatus.textContent = message;
    registerStatus.dataset.state = type;
  }
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel edit";
  cancelButton.hidden = true;
  submitButton.insertAdjacentElement("afterend", cancelButton);

  studentId.setAttribute("maxlength", String(STUDENT_ID_LENGTH));
  studentId.setAttribute("pattern", `\\d{${STUDENT_ID_LENGTH}}`);
  studentId.setAttribute(
    "title",
    `Enter exactly ${STUDENT_ID_LENGTH} digits, numbers only.`
  );

  programmeList.innerHTML = "";
  PROGRAMMES.forEach(({ name }) => {
    const option = document.createElement("option");
    option.value = name;
    programmeList.appendChild(option);
  });

  function normalizeProgramme(str) {
    return str.trim().toLowerCase();
  }

  function maxLevelFor(programmeValue) {
    const years =
      PROGRAMME_DURATIONS.get(normalizeProgramme(programmeValue)) ??
      DEFAULT_PROGRAMME_YEARS;
    return years * 100;
  }

  function refreshLevelOptions() {
    const max = maxLevelFor(course.value);

    [...level.options].forEach((option) => {
      if (!option.value) return;
      option.disabled = Number(option.value) > max;
    });

    if (level.value && Number(level.value) > max) {
      level.value = "";
    }
    level.setCustomValidity("");
  }

  function resetForm() {
    editingStudentId = null;
    form.reset();
    age.value = "";
    submitButton.value = "Add to register";
    cancelButton.hidden = true;
    form.hidden = !isStaff;
    refreshLevelOptions();
  }

  function recordCountMessage() {
    const count = registeredIds.size;
    return `${count} student record${count === 1 ? "" : "s"} in the register.`;
  }

  function clearRows() {
    studentRows.forEach((row) => row.remove());
    studentRows.clear();
    registeredIds.clear();
  }

  function removeStudent(id) {
    studentRows.get(id)?.remove();
    studentRows.delete(id);
    registeredIds.delete(id);
  }

  function insertRowInOrder(row, id) {
    const nextRow = [...studentRows.entries()]
      .filter(([otherId]) => otherId.localeCompare(id, undefined, { numeric: true }) > 0)
      .map(([, otherRow]) => otherRow)
      .find((otherRow) => otherRow.isConnected);
    if (nextRow) {
      table.insertBefore(row, nextRow);
    } else {
      table.appendChild(row);
    }
  }

  function startEditing(student) {
    editingStudentId = String(student.student_id);

    firstName.value = student.first_name ?? "";
    middleName.value = student.middle_name ?? "";
    surname.value = student.surname ?? "";
    studentId.value = student.student_id ?? "";
    gender.value = student.gender ?? "";
    dateOfBirth.value = student.date_of_birth ?? "";
    age.value = student.age ?? "";
    email.value = student.email ?? "";
    phoneNumber.value = student.phone_number ?? "";
    course.value = student.course ?? "";

    refreshLevelOptions();
    level.value = student.level ?? "";

    submitButton.value = isStaff ? "Update student" : "Update my record";
    cancelButton.hidden = false;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth" });
  }

  async function deleteStudent(student) {
    const id = String(student.student_id);
    const prompt = isStaff
      ? "Delete this student record?"
      : "Delete your student record? You won't be able to see it again unless the registry re-adds it.";
    if (!window.confirm(prompt)) return;

    try {
      await deleteStudentData(id);
      removeStudent(id);
      if (editingStudentId === id) resetForm();
      setStatus(registeredIds.size ? "Student record deleted." : "No student records yet.");
    } catch (error) {
      console.error("Failed to delete student:", error);
      setStatus(`Could not delete the record: ${error.message}`, "error");
    }
  }

  function addStudentRow(student) {
    const id = String(student.student_id);
    const row = document.createElement("div");
    row.className = "ledger__row";

    const values = [
      [student.first_name, student.middle_name, student.surname]
        .filter(Boolean)
        .join(" "),
      student.student_id,
      student.age,
      student.gender,
      student.date_of_birth,
      student.email,
      student.phone_number,
      student.course,
      student.level,
    ];

    values.forEach((value) => {
      const span = document.createElement("span");
      span.innerText = value ?? "";
      row.appendChild(span);
    });

    const actions = document.createElement("span");
    actions.className = "ledger__actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.className = "ledger__button";
    editButton.addEventListener("click", () => startEditing(student));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "ledger__button ledger__button--danger";
    deleteButton.addEventListener("click", () => deleteStudent(student));

    const resultsButton = document.createElement("button");
    resultsButton.type = "button";
    resultsButton.textContent = "Results";
    resultsButton.className = "ledger__button";
    resultsButton.addEventListener("click", () => onShowResults(student, isStaff));

    actions.append(resultsButton, editButton, deleteButton);
    row.appendChild(actions);

    insertRowInOrder(row, id);
    studentRows.set(id, row);
    registeredIds.add(id);
  }

  function calculateAge(dobValue) {
    const [year, month, day] = dobValue.split("-").map(Number);
    if (!year || !month || !day) return "";

    const today = new Date();
    let years = today.getFullYear() - year;
    const monthDiff = today.getMonth() + 1 - month;

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
      years--;
    }

    return years >= 0 ? years : "";
  }

  function todayAsDateValue() {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }

  dateOfBirth.addEventListener("change", () => {
    dateOfBirth.setCustomValidity("");

    if (!dateOfBirth.value) {
      age.value = "";
      return;
    }

    if (dateOfBirth.value > todayAsDateValue()) {
      dateOfBirth.setCustomValidity("Date of birth can't be in the future.");
      age.value = "";
      return;
    }

    age.value = calculateAge(dateOfBirth.value);
  });

  course.addEventListener("input", refreshLevelOptions);
  level.addEventListener("change", () => level.setCustomValidity(""));

  studentId.addEventListener("input", () => {
    studentId.value = studentId.value
      .replace(/\D/g, "")
      .slice(0, STUDENT_ID_LENGTH);
    studentId.setCustomValidity("");
  });

  phoneNumber.addEventListener("input", () => {
    phoneNumber.value = phoneNumber.value.replace(/\D/g, "").slice(0, 10);
  });

  const nameFields = [firstName, middleName, surname];
  const namePattern = /^[\p{L}\p{M}\s'’\-]+$/u;
  nameFields.forEach((field) => {
    field.addEventListener("input", () => {
      field.value = field.value.replace(/[^\p{L}\p{M}\s'’\-]/gu, "");
      const value = field.value.trim();
      field.setCustomValidity(
        value && !namePattern.test(value)
          ? "Use letters, spaces, apostrophes, or hyphens only."
          : ""
      );
    });
  });

  cancelButton.addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isStaff && editingStudentId === null) return;

    const idValue = studentId.value.trim();
    const duplicateId =
      isStaff && registeredIds.has(idValue) && idValue !== editingStudentId;

    studentId.setCustomValidity(
      duplicateId ? "This student ID is already registered." : ""
    );

    nameFields.forEach((field) => {
      const value = field.value.trim();
      field.setCustomValidity(
        value && !namePattern.test(value)
          ? "Use letters, spaces, apostrophes, or hyphens only."
          : ""
      );
    });

    const max = maxLevelFor(course.value);
    if (isStaff && level.value && Number(level.value) > max) {
      level.setCustomValidity(
        `${course.value.trim() || "This programme"} only runs up to level ${max}.`
      );
    } else {
      level.setCustomValidity("");
    }

    if (!form.reportValidity()) return;

    const payload = {
      first_name: firstName.value.trim(),
      middle_name: middleName.value.trim() || null,
      surname: surname.value.trim(),
      student_id: idValue,
      gender: gender.value,
      date_of_birth: dateOfBirth.value,
      age: Number(age.value) || null,
      email: email.value.trim(),
      phone_number: phoneNumber.value.trim() || null,
      course: course.value.trim(),
      level: Number(level.value),
    };
    if (!isStaff) {
      delete payload.student_id;
      delete payload.course;
      delete payload.level;
    }

    const generation = loadGeneration;
    const originalId = editingStudentId;
    const wasEditing = originalId !== null;
    submitButton.disabled = true;
    setStatus(wasEditing ? "Updating student record…" : "Saving student record…");
    try {
      const savedStudent = wasEditing
        ? await updateStudentData(originalId, payload)
        : await insertStudentData(payload);
      if (generation !== loadGeneration) return;

      if (wasEditing) removeStudent(originalId);
      removeStudent(String(savedStudent.student_id));
      addStudentRow(savedStudent);

      resetForm();
      setStatus(`${wasEditing ? "Student record updated." : "Student record saved."} ${recordCountMessage()}`);
    } catch (error) {
      console.error("Failed to save student:", error);
      setStatus(`Could not save the record: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  function clear() {
    loadGeneration++;
    isStaff = false;
    clearRows();
    resetForm();
    setStatus("");
  }

  async function load(role) {
    clear();
    const generation = loadGeneration;

    registerSection.hidden = role === "security";
    if (role === "security") {
      document.getElementById("dashboardSubtitle").textContent =
        "Campus security dispatch. Emergency alerts appear below as they come in.";
      return;
    }

    isStaff = role === "admin" || role === "registry";
    form.hidden = !isStaff;
    lockedForStudents.forEach((field) => {
      field.disabled = !isStaff;
    });
    document.getElementById("dashboardSubtitle").textContent = isStaff
      ? "Manage student records in the register."
      : "Your student record is shown below. You can update your personal details; contact the registry to change your student ID, programme, or level.";

    setStatus("Loading student records…");
    try {
      const existingStudents = await fetchSupabaseData();
      if (generation !== loadGeneration) return;

      existingStudents.forEach((student) => {
        if (student.student_id != null) addStudentRow(student);
      });
      if (registeredIds.size) {
        setStatus(recordCountMessage());
      } else {
        setStatus(isStaff
          ? "No student records yet."
          : "Your login isn't linked to a student record yet. Contact the registry.");
      }
    } catch (error) {
      if (generation !== loadGeneration) return;
      console.error("Failed to fetch Supabase data:", error);
      setStatus(`Could not load student records: ${error.message}`, "error");
    }
  }

  return { load, clear };
}

const ROLE_LABELS = { admin: "Admin", registry: "Registry", security: "Security", student: "Student" };

function createUsersPanel() {
  const panel = document.getElementById("usersPanel");
  const usersTable = document.getElementById("usersTable");
  const usersStatus = document.getElementById("usersStatus");
  const userRows = [];
  let loadGeneration = 0;

  function setStatus(message, type = "") {
    usersStatus.textContent = message;
    usersStatus.dataset.state = type;
  }

  function clear() {
    loadGeneration++;
    userRows.forEach((row) => row.remove());
    userRows.length = 0;
    setStatus("");
    panel.hidden = true;
  }

  async function linkStudent(userId, previousStudentId, nextStudentId) {
    if (nextStudentId) {
      const { data: target, error } = await supabaseClient
        .from("students")
        .select("student_id, auth_user_id")
        .eq("student_id", nextStudentId)
        .maybeSingle();
      if (error) throw error;
      if (!target) throw new Error(`No student record has ID ${nextStudentId}.`);
      if (target.auth_user_id && target.auth_user_id !== userId) {
        throw new Error(`Student ${nextStudentId} is already linked to another account.`);
      }
    }

    if (previousStudentId) {
      const { error } = await supabaseClient
        .from("students")
        .update({ auth_user_id: null })
        .eq("student_id", previousStudentId);
      if (error) throw error;
    }

    if (nextStudentId) {
      const { data, error } = await supabaseClient
        .from("students")
        .update({ auth_user_id: userId })
        .eq("student_id", nextStudentId)
        .select("student_id");
      if (error) throw error;
      if (!data.length) throw new Error(`Could not link student ${nextStudentId}.`);
    }
  }

  function addUserRow(profile, linkedStudentId, isSelf) {
    let savedRole = profile.role;
    let savedLink = linkedStudentId ?? "";

    const row = document.createElement("div");
    row.className = "ledger__row";

    const usernameCell = document.createElement("span");
    usernameCell.innerText = profile.username;
    const emailCell = document.createElement("span");
    emailCell.innerText = profile.email ?? "";

    const roleSelect = document.createElement("select");
    roleSelect.setAttribute("aria-label", `Role for ${profile.username}`);
    Object.entries(ROLE_LABELS).forEach(([value, label]) => {
      roleSelect.add(new Option(label, value, false, value === savedRole));
    });
    roleSelect.disabled = isSelf;
    if (isSelf) roleSelect.title = "You can't change your own role.";

    const linkInput = document.createElement("input");
    linkInput.type = "text";
    linkInput.inputMode = "numeric";
    linkInput.maxLength = 8;
    linkInput.placeholder = "—";
    linkInput.className = "mono";
    linkInput.value = savedLink;
    linkInput.setAttribute("aria-label", `Linked student ID for ${profile.username}`);
    linkInput.addEventListener("input", () => {
      linkInput.value = linkInput.value.replace(/\D/g, "").slice(0, 8);
    });

    function syncLinkInput() {
      linkInput.disabled = roleSelect.value !== "student";
    }
    roleSelect.addEventListener("change", syncLinkInput);
    syncLinkInput();

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.className = "ledger__button";
    saveButton.addEventListener("click", async () => {
      const nextRole = roleSelect.value;
      const nextLink = nextRole === "student" ? linkInput.value.trim() : "";
      saveButton.disabled = true;
      setStatus(`Saving ${profile.username}…`);
      try {
        if (nextRole !== savedRole) {
          const { data, error } = await supabaseClient
            .from("profiles")
            .update({ role: nextRole })
            .eq("id", profile.id)
            .select("role");
          if (error) throw error;
          if (!data.length) throw new Error("You don't have permission to change roles.");
          savedRole = nextRole;
        }

        if (nextLink !== savedLink) {
          await linkStudent(profile.id, savedLink, nextLink);
          savedLink = nextLink;
        }
        linkInput.value = savedLink;
        setStatus(`Saved ${profile.username} as ${ROLE_LABELS[savedRole]}.`);
      } catch (error) {
        console.error("Failed to save user:", error);
        setStatus(`Could not save ${profile.username}: ${error.message}`, "error");
      } finally {
        saveButton.disabled = false;
      }
    });

    const roleCell = document.createElement("span");
    roleCell.appendChild(roleSelect);
    const linkCell = document.createElement("span");
    linkCell.appendChild(linkInput);
    const actionsCell = document.createElement("span");
    actionsCell.className = "ledger__actions";
    actionsCell.appendChild(saveButton);

    row.append(usernameCell, emailCell, roleCell, linkCell, actionsCell);
    usersTable.appendChild(row);
    userRows.push(row);
  }

  async function load(currentUserId) {
    clear();
    const generation = loadGeneration;
    panel.hidden = false;
    setStatus("Loading user accounts…");

    try {
      const [profilesResult, linksResult] = await Promise.all([
        supabaseClient.from("profiles").select("id, username, email, role").order("username"),
        supabaseClient.from("students").select("student_id, auth_user_id").not("auth_user_id", "is", null),
      ]);
      if (generation !== loadGeneration) return;
      if (profilesResult.error) throw profilesResult.error;
      if (linksResult.error) throw linksResult.error;

      const linkedStudentIds = new Map(
        linksResult.data.map((link) => [link.auth_user_id, String(link.student_id)])
      );
      profilesResult.data.forEach((profile) => {
        addUserRow(profile, linkedStudentIds.get(profile.id), profile.id === currentUserId);
      });
      setStatus(`${profilesResult.data.length} user account${profilesResult.data.length === 1 ? "" : "s"}.`);
    } catch (error) {
      if (generation !== loadGeneration) return;
      console.error("Failed to load user accounts:", error);
      setStatus(`Could not load user accounts: ${error.message}`, "error");
    }
  }

  return { load, clear };
}

async function startAuth() {
  const authGate = document.getElementById("authGate");
  const appShell = document.getElementById("appShell");
  const loginForm = document.getElementById("loginForm");
  const loginStatus = document.getElementById("loginStatus");
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");

  if (!supabaseClient) {
    loginStatus.textContent = "The sign-in service did not load. Check your internet connection and reload this page.";
    return;
  }

  const resultsPanel = createResultsPanel();
  const app = createManagementApp({
    onShowResults: (student, editable) => resultsPanel.open(student, { editable }),
  });
  const usersPanel = createUsersPanel();
  const safetyPanel = createStudentSafetyPanel();
  const dispatchPanel = createDispatchPanel();
  let currentUserId = null;

  function clearPanels() {
    app.clear();
    usersPanel.clear();
    resultsPanel.clear();
    safetyPanel.clear();
    dispatchPanel.clear();
  }

  function showSignIn(message) {
    currentUserId = null;
    clearPanels();
    appShell.hidden = true;
    authGate.hidden = false;
    loginStatus.textContent = message;
  }

  async function showSession(session) {
    if (!session) {
      loginForm.reset();
      showSignIn("Ready. Sign in with your account.");
      return;
    }

    const userId = session.user.id;
    if (userId === currentUserId) return;
    currentUserId = userId;

    loginStatus.textContent = "Loading your account…";
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("username, role")
      .eq("id", userId)
      .single();
    if (currentUserId !== userId) return;

    if (error || !profile || !Object.hasOwn(ROLE_LABELS, profile.role)) {
      showSignIn(error?.message || "Your account needs a valid admin, registry, security, or student profile.");
      return;
    }

    clearPanels();
    authGate.hidden = true;
    appShell.hidden = false;
    loginStatus.textContent = "";
    document.getElementById("signedInAs").textContent = `${profile.username} · ${ROLE_LABELS[profile.role]}`;
    if (profile.role === "admin") usersPanel.load(userId);
    if (profile.role === "admin" || profile.role === "security") dispatchPanel.load();
    if (profile.role === "student") safetyPanel.load();
    await app.load(profile.role);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginStatus.textContent = "Signing in…";
    loginButton.disabled = true;
    try {
      const formData = new FormData(loginForm);
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: formData.get("email").trim(),
        password: formData.get("password"),
      });
      if (error) loginStatus.textContent = error.message;
    } catch (error) {
      loginStatus.textContent = `Sign-in failed: ${error.message}`;
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) loginStatus.textContent = error.message;
  });

  // Supabase can deadlock if its own methods are awaited inside this callback, so defer the work.
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => showSession(session), 0);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAuth, { once: true });
} else {
  startAuth();
}
