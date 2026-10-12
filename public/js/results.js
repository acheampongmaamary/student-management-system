const KNUST_CLASSIFICATIONS = [
  { min: 70, label: "First Class" },
  { min: 60, label: "Second Class (Upper Division)" },
  { min: 50, label: "Second Class (Lower Division)" },
  { min: 40, label: "Pass" },
  { min: 0, label: "Fail" },
];

const KNUST_GRADES = [
  { min: 70, grade: "A" },
  { min: 60, grade: "B" },
  { min: 50, grade: "C" },
  { min: 40, grade: "D" },
  { min: 0, grade: "F" },
];

function gradeForMark(mark) {
  return KNUST_GRADES.find(({ min }) => mark >= min).grade;
}

function classificationFor(cwa) {
  return KNUST_CLASSIFICATIONS.find(({ min }) => cwa >= min).label;
}

function weightedAverage(results) {
  const totalCredits = results.reduce((sum, r) => sum + r.credit_hours, 0);
  if (!totalCredits) return null;
  const weighted = results.reduce((sum, r) => sum + r.mark * r.credit_hours, 0);
  return { average: weighted / totalCredits, credits: totalCredits };
}

function currentAcademicYear() {
  const today = new Date();
  const year = today.getFullYear();
  return today.getMonth() >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

function createResultsPanel() {
  const panel = document.getElementById("resultsPanel");
  const title = document.getElementById("resultsTitle");
  const status = document.getElementById("resultsStatus");
  const summary = document.getElementById("resultsSummary");
  const body = document.getElementById("resultsBody");
  const form = document.getElementById("resultForm");
  const courseCode = document.getElementById("resultCourseCode");
  const courseTitle = document.getElementById("resultCourseTitle");
  const creditHours = document.getElementById("resultCreditHours");
  const academicYear = document.getElementById("resultAcademicYear");
  const semester = document.getElementById("resultSemester");
  const mark = document.getElementById("resultMark");
  const courseList = document.getElementById("courseList");
  const closeButton = document.getElementById("resultsClose");

  let currentStudentId = null;
  let canEdit = false;
  let loadGeneration = 0;
  const knownCourses = new Map();

  function setStatus(message, type = "") {
    status.textContent = message;
    status.dataset.state = type;
  }

  function clear() {
    loadGeneration++;
    currentStudentId = null;
    panel.hidden = true;
    body.replaceChildren();
    summary.replaceChildren();
    setStatus("");
    form.reset();
  }

  function summaryItem(label, value) {
    const item = document.createElement("div");
    item.className = "results-summary__item";
    const labelEl = document.createElement("span");
    labelEl.className = "results-summary__label";
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    return item;
  }

  function render(results) {
    body.replaceChildren();
    summary.replaceChildren();

    const cwa = weightedAverage(results);
    summary.append(
      summaryItem("CWA", cwa ? cwa.average.toFixed(2) : "—"),
      summaryItem("Classification", cwa ? classificationFor(cwa.average) : "—"),
      summaryItem("Credits taken", cwa ? String(cwa.credits) : "0")
    );

    if (!results.length) {
      setStatus("No results recorded yet.");
      return;
    }
    setStatus("");

    const semesters = new Map();
    results.forEach((result) => {
      const key = `${result.academic_year} · Semester ${result.semester}`;
      if (!semesters.has(key)) semesters.set(key, []);
      semesters.get(key).push(result);
    });

    semesters.forEach((semesterResults, key) => {
      const section = document.createElement("section");
      section.className = "results-semester";

      const heading = document.createElement("h3");
      const swa = weightedAverage(semesterResults);
      heading.textContent = `${key} — Semester average ${swa.average.toFixed(2)}`;
      section.appendChild(heading);

      const table = document.createElement("div");
      table.className = "ledger ledger--results";
      const head = document.createElement("div");
      head.className = "ledger__row ledger__row--head";
      ["Code", "Course", "Credits", "Mark", "Grade", ""].forEach((text) => {
        const span = document.createElement("span");
        span.textContent = text;
        head.appendChild(span);
      });
      table.appendChild(head);

      semesterResults.forEach((result) => {
        const row = document.createElement("div");
        row.className = "ledger__row";
        [
          result.course_code,
          result.course_title,
          result.credit_hours,
          result.mark.toFixed(2),
          gradeForMark(result.mark),
        ].forEach((value) => {
          const span = document.createElement("span");
          span.innerText = value;
          row.appendChild(span);
        });

        const actions = document.createElement("span");
        if (canEdit) {
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "ledger__button ledger__button--danger";
          deleteButton.textContent = "Delete";
          deleteButton.addEventListener("click", () => deleteResult(result));
          actions.appendChild(deleteButton);
        }
        row.appendChild(actions);
        table.appendChild(row);
      });

      section.appendChild(table);
      body.appendChild(section);
    });
  }

  async function loadResults() {
    const generation = loadGeneration;
    setStatus("Loading results…");
    const { data, error } = await supabaseClient
      .from("academic_results")
      .select("id, course_code, academic_year, semester, mark, courses(course_title, credit_hours)")
      .eq("student_id", currentStudentId)
      .order("academic_year")
      .order("semester")
      .order("course_code");
    if (generation !== loadGeneration) return;

    if (error) {
      console.error("Failed to load results:", error);
      setStatus(`Could not load results: ${error.message}`, "error");
      return;
    }

    render(
      data.map((row) => ({
        id: row.id,
        course_code: row.course_code,
        course_title: row.courses?.course_title ?? "",
        credit_hours: row.courses?.credit_hours ?? 0,
        academic_year: row.academic_year,
        semester: row.semester,
        mark: Number(row.mark),
      }))
    );
  }

  async function loadCourses() {
    const { data, error } = await supabaseClient
      .from("courses")
      .select("course_code, course_title, credit_hours")
      .order("course_code");
    if (error) return;

    knownCourses.clear();
    courseList.replaceChildren();
    data.forEach((course) => {
      knownCourses.set(course.course_code, course);
      const option = document.createElement("option");
      option.value = course.course_code;
      option.label = course.course_title;
      courseList.appendChild(option);
    });
  }

  async function deleteResult(result) {
    if (!window.confirm(`Delete the ${result.course_code} result for ${result.academic_year}, semester ${result.semester}?`)) return;

    const { data, error } = await supabaseClient
      .from("academic_results")
      .delete()
      .eq("id", result.id)
      .select("id");
    if (error || !data.length) {
      setStatus(`Could not delete the result: ${error?.message ?? "you don't have permission."}`, "error");
      return;
    }
    await loadResults();
  }

  courseCode.addEventListener("input", () => {
    courseCode.value = courseCode.value.toUpperCase();
    const known = knownCourses.get(courseCode.value.trim());
    if (known) {
      courseTitle.value = known.course_title;
      creditHours.value = known.credit_hours;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEdit || !currentStudentId) return;
    if (!form.reportValidity()) return;

    const submitButton = form.querySelector('[type="submit"]');
    const code = courseCode.value.trim().toUpperCase();
    submitButton.disabled = true;
    setStatus("Saving result…");

    try {
      const { error: courseError } = await supabaseClient.from("courses").upsert({
        course_code: code,
        course_title: courseTitle.value.trim(),
        credit_hours: Number(creditHours.value),
      });
      if (courseError) throw courseError;

      const { error } = await supabaseClient.from("academic_results").insert({
        student_id: currentStudentId,
        course_code: code,
        academic_year: academicYear.value.trim(),
        semester: Number(semester.value),
        mark: Number(mark.value),
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error(`${code} already has a result for ${academicYear.value}, semester ${semester.value}. Delete it first to re-enter it.`);
        }
        throw error;
      }

      courseCode.value = "";
      courseTitle.value = "";
      creditHours.value = "";
      mark.value = "";
      courseCode.focus();
      await Promise.all([loadResults(), loadCourses()]);
    } catch (error) {
      console.error("Failed to save result:", error);
      setStatus(`Could not save the result: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  closeButton.addEventListener("click", clear);

  async function open(student, { editable }) {
    clear();
    currentStudentId = String(student.student_id);
    canEdit = editable;

    const name = [student.first_name, student.middle_name, student.surname].filter(Boolean).join(" ");
    title.textContent = `Academic results — ${name} (${currentStudentId})`;
    form.hidden = !canEdit;
    academicYear.value = currentAcademicYear();
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth" });

    await Promise.all([loadResults(), canEdit ? loadCourses() : null]);
  }

  return { open, clear };
}
