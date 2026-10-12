function getCurrentPosition(timeoutMs) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

function locationArgs(coords) {
  return {
    p_latitude: coords?.latitude ?? null,
    p_longitude: coords?.longitude ?? null,
    p_accuracy_m: coords?.accuracy ?? null,
  };
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function createStudentSafetyPanel() {
  const panel = document.getElementById("safetyPanel");
  const status = document.getElementById("safetyStatus");
  const panicButton = document.getElementById("panicButton");
  const walkForm = document.getElementById("safewalkForm");
  const walkMinutes = document.getElementById("safewalkMinutes");
  const walkDestination = document.getElementById("safewalkDestination");
  const walkActive = document.getElementById("safewalkActive");
  const walkCountdown = document.getElementById("safewalkCountdown");
  const walkDetails = document.getElementById("safewalkDetails");
  const checkInButton = document.getElementById("safewalkCheckIn");

  const LOCATION_UPDATE_MS = 60000;
  let activeWalk = null;
  let tickTimer = null;
  let locationTimer = null;
  let loadGeneration = 0;

  function setStatus(message, type = "") {
    status.textContent = message;
    status.dataset.state = type;
  }

  function stopTimers() {
    clearInterval(tickTimer);
    clearInterval(locationTimer);
    tickTimer = null;
    locationTimer = null;
  }

  function renderWalk() {
    walkForm.hidden = activeWalk !== null;
    walkActive.hidden = activeWalk === null;
    if (!activeWalk) return;

    const remaining = new Date(activeWalk.safewalk_due_at).getTime() - Date.now();
    const overdue = remaining <= 0;
    walkActive.dataset.state = overdue ? "overdue" : "";
    walkCountdown.textContent = overdue ? "OVERDUE" : formatCountdown(remaining);
    walkDetails.textContent = overdue
      ? "Your time is up and campus security can now see this walk as overdue. Check in now if you are safe."
      : `Heading to ${activeWalk.note || "your destination"}. Check in before ${formatTime(activeWalk.safewalk_due_at)} or security will be alerted.`;
  }

  async function sendLocationUpdate() {
    if (!activeWalk) return;
    const coords = await getCurrentPosition(10000);
    if (!coords || !activeWalk) return;
    await supabaseClient.rpc("update_safewalk_location", {
      p_alert_id: activeWalk.id,
      ...locationArgs(coords),
    });
  }

  function startWalkTimers() {
    stopTimers();
    renderWalk();
    tickTimer = setInterval(renderWalk, 1000);
    locationTimer = setInterval(sendLocationUpdate, LOCATION_UPDATE_MS);
  }

  async function loadActiveWalk() {
    const generation = loadGeneration;
    const { data, error } = await supabaseClient
      .from("emergency_alerts")
      .select("id, note, safewalk_due_at")
      .eq("alert_type", "safewalk")
      .eq("status", "monitoring")
      .order("created_at", { ascending: false })
      .limit(1);
    if (generation !== loadGeneration) return;
    if (error) {
      setStatus(`Could not check for an active SafeWalk: ${error.message}`, "error");
      return;
    }

    activeWalk = data[0] ?? null;
    if (activeWalk) {
      startWalkTimers();
    } else {
      stopTimers();
      renderWalk();
    }
  }

  panicButton.addEventListener("click", async () => {
    if (!window.confirm("Send an emergency alert with your location to campus security now?")) return;

    panicButton.disabled = true;
    setStatus("Getting your location and sending the alert…");
    try {
      const coords = await getCurrentPosition(5000);
      const { error } = await supabaseClient.rpc("raise_panic", { ...locationArgs(coords), p_note: null });
      if (error) throw error;
      setStatus(
        coords
          ? "Alert sent with your location. Security has been notified. Stay where it is safe and keep your phone on."
          : "Alert sent, but your location could not be shared. If you can, call campus security and tell them where you are.",
        "alert"
      );
    } catch (error) {
      console.error("Failed to raise panic alert:", error);
      setStatus(`The alert could not be sent: ${error.message}. Call campus security directly.`, "error");
    } finally {
      panicButton.disabled = false;
    }
  });

  walkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = walkForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    setStatus("Starting SafeWalk…");
    try {
      const coords = await getCurrentPosition(5000);
      const { error } = await supabaseClient.rpc("start_safewalk", {
        p_minutes: Number(walkMinutes.value),
        p_destination: walkDestination.value.trim() || null,
        ...locationArgs(coords),
      });
      if (error) throw error;
      walkForm.reset();
      setStatus(coords ? "" : "SafeWalk started, but your location could not be shared. Allow location access for this site if you can.");
      await loadActiveWalk();
    } catch (error) {
      console.error("Failed to start SafeWalk:", error);
      setStatus(`Could not start SafeWalk: ${error.message}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  checkInButton.addEventListener("click", async () => {
    if (!activeWalk) return;
    checkInButton.disabled = true;
    try {
      const { error } = await supabaseClient.rpc("complete_safewalk", { p_alert_id: activeWalk.id });
      if (error) throw error;
      setStatus("Checked in. Glad you made it safely.");
      await loadActiveWalk();
    } catch (error) {
      console.error("Failed to check in:", error);
      setStatus(error.message, "error");
      await loadActiveWalk();
    } finally {
      checkInButton.disabled = false;
    }
  });

  function clear() {
    loadGeneration++;
    stopTimers();
    activeWalk = null;
    panel.hidden = true;
    walkForm.reset();
    setStatus("");
  }

  async function load() {
    clear();
    panel.hidden = false;
    await loadActiveWalk();
  }

  return { load, clear };
}

function createDispatchPanel() {
  const panel = document.getElementById("dispatchPanel");
  const status = document.getElementById("dispatchStatus");
  const list = document.getElementById("dispatchList");

  const REFRESH_MS = 20000;
  let refreshTimer = null;
  let channel = null;
  let loadGeneration = 0;
  let knownCriticalIds = new Set();

  function setStatus(message, type = "") {
    status.textContent = message;
    status.dataset.state = type;
  }

  function isOverdue(alert) {
    return alert.status === "monitoring" && new Date(alert.safewalk_due_at).getTime() <= Date.now();
  }

  function isCritical(alert) {
    return alert.status === "active" || isOverdue(alert);
  }

  function priority(alert) {
    if (isCritical(alert)) return 0;
    if (alert.status === "acknowledged") return 1;
    return 2;
  }

  function describe(alert) {
    if (alert.alert_type === "panic") {
      return alert.status === "active" ? "PANIC ALERT" : "Panic alert (acknowledged)";
    }
    if (isOverdue(alert)) return "SAFEWALK OVERDUE";
    if (alert.status === "acknowledged") return "SafeWalk overdue (acknowledged)";
    return `SafeWalk in progress — due ${formatTime(alert.safewalk_due_at)}`;
  }

  function line(text, className) {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.innerText = text;
    return p;
  }

  function actionButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await handler();
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  async function runAction(fn, args) {
    const { error } = await supabaseClient.rpc(fn, args);
    if (error) {
      setStatus(error.message, "error");
      return;
    }
    await refresh();
  }

  function renderAlert(alert) {
    const card = document.createElement("article");
    card.className = "alert-card";
    if (isCritical(alert)) card.classList.add("alert-card--critical");
    else if (alert.status === "acknowledged") card.classList.add("alert-card--acknowledged");

    const student = alert.students;
    const name = student
      ? [student.first_name, student.middle_name, student.surname].filter(Boolean).join(" ")
      : "Unknown student";

    card.append(
      line(describe(alert), "alert-card__type"),
      line(`${name} · ${alert.student_id}${student?.phone_number ? ` · ${student.phone_number}` : ""}`, "alert-card__student"),
      line(`Raised ${formatTime(alert.created_at)}${alert.note ? ` · ${alert.alert_type === "safewalk" ? "Destination" : "Note"}: ${alert.note}` : ""}`)
    );

    if (alert.latitude != null && alert.longitude != null) {
      const link = document.createElement("a");
      link.href = `https://www.openstreetmap.org/?mlat=${alert.latitude}&mlon=${alert.longitude}#map=18/${alert.latitude}/${alert.longitude}`;
      link.target = "_blank";
      link.rel = "noopener";
      const accuracy = alert.accuracy_m ? ` (±${Math.round(alert.accuracy_m)} m)` : "";
      const updated = alert.location_updated_at ? `, updated ${formatTime(alert.location_updated_at)}` : "";
      link.textContent = `Open location on map${accuracy}${updated}`;
      const p = document.createElement("p");
      p.appendChild(link);
      card.appendChild(p);
    } else {
      card.appendChild(line("No location shared — call the student.", "alert-card__warning"));
    }

    const actions = document.createElement("div");
    actions.className = "alert-card__actions";
    if (alert.status === "active" || alert.status === "monitoring") {
      actions.appendChild(actionButton("Acknowledge", "ledger__button", () =>
        runAction("acknowledge_alert", { p_alert_id: alert.id })
      ));
    }
    actions.appendChild(actionButton("Resolve", "ledger__button ledger__button--danger", () => {
      const note = window.prompt("How was this alert resolved? (optional)");
      if (note === null) return Promise.resolve();
      return runAction("resolve_alert", { p_alert_id: alert.id, p_resolution_note: note });
    }));
    card.appendChild(actions);

    return card;
  }

  async function refresh() {
    const generation = loadGeneration;
    const { data, error } = await supabaseClient
      .from("emergency_alerts")
      .select("*, students(first_name, middle_name, surname, phone_number)")
      .in("status", ["active", "monitoring", "acknowledged"])
      .order("created_at", { ascending: false });
    if (generation !== loadGeneration) return;

    if (error) {
      console.error("Failed to load alerts:", error);
      setStatus(`Could not load alerts: ${error.message}`, "error");
      return;
    }

    data.sort((a, b) => priority(a) - priority(b));
    list.replaceChildren(...data.map(renderAlert));

    const critical = data.filter(isCritical);
    const newCritical = critical.some((alert) => !knownCriticalIds.has(alert.id));
    knownCriticalIds = new Set(critical.map((alert) => alert.id));
    document.title = critical.length
      ? `(${critical.length}) ALERT — Student Management System`
      : "Student Management System";

    if (critical.length) {
      setStatus(`${critical.length} alert${critical.length === 1 ? "" : "s"} need${critical.length === 1 ? "s" : ""} attention.`, "error");
    } else {
      setStatus(data.length ? `No urgent alerts. ${data.length} open.` : "No open alerts.");
    }
    if (newCritical && navigator.vibrate) navigator.vibrate([300, 100, 300]);
  }

  function clear() {
    loadGeneration++;
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (channel) {
      supabaseClient.removeChannel(channel);
      channel = null;
    }
    knownCriticalIds = new Set();
    list.replaceChildren();
    setStatus("");
    panel.hidden = true;
    document.title = "Student Management System";
  }

  async function load() {
    clear();
    panel.hidden = false;
    setStatus("Loading alerts…");
    refreshTimer = setInterval(refresh, REFRESH_MS);
    channel = supabaseClient
      .channel("emergency-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_alerts" }, () => refresh())
      .subscribe();
    await refresh();
  }

  return { load, clear };
}
