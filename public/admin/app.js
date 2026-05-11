const state = {
  media: [],
  settings: null,
  dragState: null
};

const loginCard = document.getElementById("loginCard");
const adminApp = document.getElementById("adminApp");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const uploadForm = document.getElementById("uploadForm");
const uploadMessage = document.getElementById("uploadMessage");
const settingsForm = document.getElementById("settingsForm");
const settingsMessage = document.getElementById("settingsMessage");
const mediaList = document.getElementById("mediaList");
const emptyState = document.getElementById("emptyState");
const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");

function setMessage(element, message, isError = false) {
  element.textContent = message || "";
  element.classList.toggle("error", Boolean(isError));
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    headers,
    ...options
  });

  if (!response.ok) {
    let message = "Anfrage fehlgeschlagen";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

function applyAuthState(authenticated) {
  loginCard.classList.toggle("hidden", authenticated);
  adminApp.classList.toggle("hidden", !authenticated);
}

function renderSettings() {
  if (!state.settings) return;
  document.getElementById("imageDurationInput").value = state.settings.imageDuration;
  document.getElementById("transitionInput").value = state.settings.transition;
  document.getElementById("syncModeInput").value = state.settings.syncMode;
  document.getElementById("videoFitInput").value = state.settings.videoFit || "contain";
  document.getElementById("backgroundTypeInput").value = state.settings.background.type;
  document.getElementById("backgroundValueInput").value = state.settings.background.value;
}

function renderMedia() {
  mediaList.innerHTML = "";
  emptyState.classList.toggle("hidden", state.media.length > 0);

  for (const item of state.media) {
    const li = document.createElement("li");
    li.className = "media-item";
    li.dataset.id = item.id;

    const preview = item.type === "image"
      ? `<img class="preview" src="${item.url}" alt="${item.originalName}">`
      : `<div class="preview video">Video</div>`;

    li.innerHTML = `
      <button class="drag-handle" type="button" aria-label="Reihenfolge aendern" title="Ziehen zum Sortieren">≡</button>
      ${preview}
      <div class="media-meta">
        <h3>${item.originalName}</h3>
        <p>Typ: ${item.type} · Rotation: ${item.rotation}° · ${item.enabled ? "sichtbar" : "ausgeblendet"}</p>
        <p>Datei: ${item.filename}</p>
      </div>
      <div class="controls">
        <label>
          Sichtbar
          <input class="toggle-visibility" type="checkbox" ${item.enabled ? "checked" : ""}>
        </label>
        <select class="rotation-select mini">
          <option value="0" ${item.rotation === 0 ? "selected" : ""}>0°</option>
          <option value="90" ${item.rotation === 90 ? "selected" : ""}>90°</option>
          <option value="180" ${item.rotation === 180 ? "selected" : ""}>180°</option>
          <option value="270" ${item.rotation === 270 ? "selected" : ""}>270°</option>
        </select>
        <button class="danger delete-button" type="button">Löschen</button>
      </div>
    `;

    li.querySelector(".toggle-visibility").addEventListener("change", async (event) => {
      await updateMedia(item.id, { enabled: event.target.checked });
    });

    li.querySelector(".rotation-select").addEventListener("change", async (event) => {
      await updateMedia(item.id, { rotation: Number(event.target.value) });
    });

    li.querySelector(".delete-button").addEventListener("click", async () => {
      if (!window.confirm(`"${item.originalName}" wirklich löschen?`)) return;
      await fetchJson(`/api/media/${item.id}`, { method: "DELETE" });
      await loadMedia();
    });

    li.querySelector(".drag-handle").addEventListener("pointerdown", (event) => {
      startPointerDrag(event, li, item.id);
    });

    mediaList.appendChild(li);
  }
}

function startPointerDrag(event, element, id) {
  if (event.button !== 0) return;
  event.preventDefault();

  const rect = element.getBoundingClientRect();
  const placeholder = document.createElement("li");
  placeholder.className = "media-item media-item-placeholder";
  placeholder.style.height = `${rect.height}px`;
  mediaList.insertBefore(placeholder, element.nextSibling);

  state.dragState = {
    id,
    element,
    placeholder,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width
  };

  element.classList.add("dragging");
  element.style.width = `${rect.width}px`;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  document.body.classList.add("drag-active");
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
  window.addEventListener("pointercancel", onPointerUp, { once: true });
}

function onPointerMove(event) {
  if (!state.dragState) return;

  const { element, placeholder, offsetX, offsetY } = state.dragState;
  element.style.left = `${event.clientX - offsetX}px`;
  element.style.top = `${event.clientY - offsetY}px`;

  const siblings = [...mediaList.querySelectorAll(".media-item:not(.dragging):not(.media-item-placeholder)")];
  const target = siblings.find((entry) => {
    const bounds = entry.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2;
  });

  if (target) {
    mediaList.insertBefore(placeholder, target);
  } else {
    mediaList.appendChild(placeholder);
  }
}

async function onPointerUp() {
  if (!state.dragState) return;

  const { element, placeholder } = state.dragState;
  window.removeEventListener("pointermove", onPointerMove);
  document.body.classList.remove("drag-active");

  mediaList.insertBefore(element, placeholder);
  placeholder.remove();

  element.classList.remove("dragging");
  element.style.width = "";
  element.style.left = "";
  element.style.top = "";

  state.dragState = null;

  const ids = [...mediaList.querySelectorAll(".media-item")].map((entry) => entry.dataset.id);
  if (!ids.length) return;

  const currentIds = state.media.map((entry) => entry.id);
  const changed = ids.some((entryId, index) => entryId !== currentIds[index]);
  if (!changed) return;

  try {
    await saveOrder(ids);
  } catch (error) {
    await loadMedia();
    setMessage(uploadMessage, "");
    setMessage(settingsMessage, "");
    setMessage(loginMessage, "");
    window.alert(`Sortieren fehlgeschlagen: ${error.message}`);
  }
}

async function loadSettings() {
  state.settings = await fetchJson("/api/settings");
  renderSettings();
}

async function loadMedia() {
  state.media = await fetchJson("/api/media");
  renderMedia();
}

async function updateMedia(id, payload) {
  await fetchJson(`/api/media/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  await loadMedia();
}

async function saveOrder(ids) {
  state.media = await fetchJson("/api/media/reorder", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
  renderMedia();
}

async function bootstrap() {
  try {
    const session = await fetchJson("/api/session");
    applyAuthState(session.authenticated);
    if (session.authenticated) {
      await Promise.all([loadSettings(), loadMedia()]);
    }
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");
  const password = document.getElementById("passwordInput").value;
  try {
    await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    applyAuthState(true);
    document.getElementById("passwordInput").value = "";
    await Promise.all([loadSettings(), loadMedia()]);
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(uploadMessage, "");
  const files = document.getElementById("filesInput").files;
  if (!files.length) {
    setMessage(uploadMessage, "Bitte zuerst Dateien auswählen.", true);
    return;
  }

  const formData = new FormData();
  const metadata = {};
  for (const file of files) {
    formData.append("files", file);
    if (file.type.startsWith("video/")) {
      metadata[file.name] = {
        durationSeconds: await readVideoDuration(file)
      };
    }
  }
  formData.append("metadata", JSON.stringify(metadata));

  try {
    const response = await fetch("/api/media", { method: "POST", body: formData });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Upload fehlgeschlagen.");
    }
    setMessage(uploadMessage, "Upload erfolgreich gespeichert.");
    uploadForm.reset();
    await loadMedia();
  } catch (error) {
    setMessage(uploadMessage, error.message, true);
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(settingsMessage, "");
  const payload = {
    imageDuration: Number(document.getElementById("imageDurationInput").value),
    transition: document.getElementById("transitionInput").value,
    syncMode: document.getElementById("syncModeInput").value,
    videoFit: document.getElementById("videoFitInput").value,
    background: {
      type: document.getElementById("backgroundTypeInput").value,
      value: document.getElementById("backgroundValueInput").value.trim()
    }
  };

  try {
    state.settings = await fetchJson("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderSettings();
    setMessage(settingsMessage, "Einstellungen gespeichert.");
  } catch (error) {
    setMessage(settingsMessage, error.message, true);
  }
});

refreshButton.addEventListener("click", async () => {
  await Promise.all([loadSettings(), loadMedia()]);
});

logoutButton.addEventListener("click", async () => {
  await fetchJson("/api/logout", { method: "POST" });
  applyAuthState(false);
  state.media = [];
  renderMedia();
});

function readVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? Math.ceil(video.duration) : 15;
      URL.revokeObjectURL(url);
      resolve(durationSeconds);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(15);
    };
  });
}

bootstrap();
