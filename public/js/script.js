const PROJECT_REF = "lzpummcsjxlcsiqkqvwa";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6cHVtbWNzanhsY3NpcWtxdndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1ODkzODMsImV4cCI6MjEwNjE2NTM4M30.NpyLo7D-BE1VQj-H_TgEbnNjtPxnVsJxMSkrsKoLXWA";
const tableName = "students";

const BASE_URL = `https://${PROJECT_REF}.supabase.co/rest/v1/${tableName}`;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

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
  const response = await fetch(`${BASE_URL}?select=*&order=student_id.asc`, {
    method: "GET",
    headers,
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return await response.json();
}

async function insertStudentData(studentPayload) {
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
  const query = new URLSearchParams({
    student_id: `eq.${studentId}`,
  });

  const response = await fetch(`${BASE_URL}?${query}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));
}

document.body.onload = async () => {
  const form = document.getElementById("document");
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
  const PROGRAMME_DURATIONS = {
    "bsc computer science": 4,
    "bsc information technology": 4,
    "bsc computer engineering": 4,
    "bsc electrical/electronic engineering": 4,
    "bsc mathematics": 4,
    "bsc statistics": 4,
    "bsc physics": 4,
    "bsc biochemistry": 4,
    "bsc nursing": 4,
    "bsc architecture": 5,
    "bachelor of laws (llb)": 4,
    "doctor of pharmacy (pharmd)": 6,
    "doctor of medicine (mb chb)": 6,
  };
  const DEFAULT_PROGRAMME_YEARS = 4;

  const registeredIds = [];
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

  function titleCase(str) {
    return str.replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function normalizeProgramme(str) {
    return str.trim().toLowerCase();
  }

  function maxLevelFor(programmeValue) {
    const years =
      PROGRAMME_DURATIONS[normalizeProgramme(programmeValue)] ??
      DEFAULT_PROGRAMME_YEARS;
    return years * 100;
  }

  async function loadProgrammes() {
    return Object.keys(PROGRAMME_DURATIONS).map(titleCase);
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
    refreshLevelOptions();
  }

  function appendRowToTable(student) {
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
    editButton.addEventListener("click", () => {
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

      submitButton.value = "Update student";
      cancelButton.hidden = false;
      form.scrollIntoView({ behavior: "smooth" });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "ledger__button ledger__button--danger";
    deleteButton.addEventListener("click", async () => {
      const id = String(student.student_id);
      if (!window.confirm("Delete this student record?")) return;

      try {
        await deleteStudentData(id);

        const idIndex = registeredIds.indexOf(id);
        if (idIndex !== -1) registeredIds.splice(idIndex, 1);

        studentRows.get(id)?.remove();
        studentRows.delete(id);

        if (editingStudentId === id) resetForm();
        setStatus(registeredIds.length ? "Student record deleted." : "No student records yet.");
      } catch (error) {
        console.error("Failed to delete student:", error);
        setStatus(`Could not delete the record: ${error.message}`, "error");
      }
    });

    actions.append(editButton, deleteButton);
    row.appendChild(actions);
    table.appendChild(row);

    studentRows.set(String(student.student_id), row);
  }

  try {
    const existingStudents = await fetchSupabaseData();
    existingStudents.forEach((student) => {
      if (student.student_id != null) registeredIds.push(String(student.student_id));
      appendRowToTable(student);
    });
    setStatus(existingStudents.length ? `${existingStudents.length} student record${existingStudents.length === 1 ? "" : "s"} in the register.` : "No student records yet.");
  } catch (error) {
    console.error("Failed to fetch Supabase data:", error);
    setStatus(`Could not load student records: ${error.message}`, "error");
  }

  const programmes = await loadProgrammes();
  programmeList.innerHTML = "";
  programmes.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    programmeList.appendChild(option);
  });

  function calculateAge(dobValue) {
    const dob = new Date(dobValue);
    if (Number.isNaN(dob.getTime())) return "";

    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      years--;
    }

    return years >= 0 ? years : "";
  }

  dateOfBirth.addEventListener("change", () => {
    dateOfBirth.setCustomValidity("");

    if (!dateOfBirth.value) {
      age.value = "";
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    if (dateOfBirth.value > today) {
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

  cancelButton.addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const idValue = studentId.value.trim();
    const duplicateId =
      registeredIds.includes(idValue) && idValue !== editingStudentId;

    studentId.setCustomValidity(
      duplicateId ? "This student ID is already registered." : ""
    );

    const max = maxLevelFor(course.value);
    if (level.value && Number(level.value) > max) {
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
      phone_number: phoneNumber.value.trim(),
      course: course.value.trim(),
      level: Number(level.value),
    };

    const wasEditing = editingStudentId !== null;
    submitButton.disabled = true;
    setStatus(wasEditing ? "Updating student record…" : "Saving student record…");
    try {
      if (editingStudentId !== null) {
        const originalId = editingStudentId;
        const updatedStudent = await updateStudentData(originalId, payload);

        studentRows.get(originalId)?.remove();
        studentRows.delete(originalId);

        const oldIdIndex = registeredIds.indexOf(originalId);
        if (oldIdIndex !== -1) registeredIds.splice(oldIdIndex, 1);

        const newId = String(updatedStudent.student_id);
        if (!registeredIds.includes(newId)) registeredIds.push(newId);

        appendRowToTable(updatedStudent);
      } else {
        const insertedStudent = await insertStudentData(payload);
        const newId = String(insertedStudent.student_id);

        if (!registeredIds.includes(newId)) registeredIds.push(newId);
        appendRowToTable(insertedStudent);
      }

      resetForm();
      setStatus(`${wasEditing ? "Student record updated." : "Student record saved."} ${registeredIds.length} record${registeredIds.length === 1 ? "" : "s"} in the register.`);
    } catch (error) {
      console.error("Failed to save student:", error);
      setStatus(`Could not save the record: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
};
