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
const uploadOverlay = document.getElementById("uploadOverlay");
const uploadOverlayStatus = document.getElementById("uploadOverlayStatus");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const settingsForm = document.getElementById("settingsForm");
const settingsMessage = document.getElementById("settingsMessage");
const passwordForm = document.getElementById("passwordForm");
const passwordMessage = document.getElementById("passwordMessage");
const mediaList = document.getElementById("mediaList");
const emptyState = document.getElementById("emptyState");
const clearAllButton = document.getElementById("clearAllButton");
const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");
const filesInput = document.getElementById("filesInput");

const UPLOAD_BATCH_SIZE = 10;

function setMessage(element, message, isError = false) {
  element.textContent = message || "";
  element.classList.toggle("error", Boolean(isError));
}

function setUploadBusy(isBusy, status = "", progress = 0) {
  uploadOverlay.classList.toggle("hidden", !isBusy);
  uploadOverlay.setAttribute("aria-hidden", String(!isBusy));
  document.body.classList.toggle("overlay-active", isBusy);
  uploadOverlayStatus.textContent = status;
  uploadProgressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  filesInput.disabled = isBusy;

  const submitButton = uploadForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Upload läuft..." : "Dateien hochladen";
  }
}

function splitIntoBatches(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
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

    let preview = `<div class="preview video">Video</div>`;
    if (item.type === "image") {
      preview = `<img class="preview" src="${item.url}" alt="${item.originalName}">`;
    } else if (item.type === "document") {
      preview = `<div class="preview document">PDF</div>`;
    }

    li.innerHTML = `
      <button class="drag-handle" type="button" aria-label="Reihenfolge aendern" title="Ziehen zum Sortieren">≡</button>
      ${preview}
      <div class="media-meta">
        <h3>${item.originalName}</h3>
        <p>Typ: ${item.type} · Rotation: ${item.rotation}° · ${item.enabled ? "sichtbar" : "ausgeblendet"}</p>
        <p>Datei: ${item.filename}</p>
        ${item.type === "image" || item.type === "video" ? `
          <div class="document-settings">
            <label>
              Anzeige
              <select class="display-fit-select mini">
                <option value="max" ${(!item.displayFit || item.displayFit === "max" || item.displayFit === "contain") ? "selected" : ""}>Maximal ohne Rand</option>
                <option value="cover" ${item.displayFit === "cover" ? "selected" : ""}>Füllend</option>
                <option value="stretch" ${item.displayFit === "stretch" ? "selected" : ""}>Strecken</option>
                <option value="original" ${item.displayFit === "original" ? "selected" : ""}>Originalgröße</option>
              </select>
            </label>
            <label>
              Position
              <select class="display-position-select mini">
                <option value="center" ${item.displayPosition === "center" ? "selected" : ""}>Mitte</option>
                <option value="top" ${item.displayPosition === "top" ? "selected" : ""}>Oben</option>
                <option value="bottom" ${item.displayPosition === "bottom" ? "selected" : ""}>Unten</option>
                <option value="left" ${item.displayPosition === "left" ? "selected" : ""}>Links</option>
                <option value="right" ${item.displayPosition === "right" ? "selected" : ""}>Rechts</option>
                <option value="top-left" ${item.displayPosition === "top-left" ? "selected" : ""}>Oben links</option>
                <option value="top-right" ${item.displayPosition === "top-right" ? "selected" : ""}>Oben rechts</option>
                <option value="bottom-left" ${item.displayPosition === "bottom-left" ? "selected" : ""}>Unten links</option>
                <option value="bottom-right" ${item.displayPosition === "bottom-right" ? "selected" : ""}>Unten rechts</option>
              </select>
            </label>
            <label>
              Skalierung %
              <input class="display-scale mini-input" type="number" min="10" max="400" value="${item.displayScalePercent || 100}">
            </label>
            ${item.type === "video" ? `
              <label class="checkbox-row">
                <input class="video-show-complete" type="checkbox" ${item.videoShowComplete ? "checked" : ""}>
                <span>Komplett anzeigen</span>
              </label>
              <label>
                Videodauer
                <input class="video-duration mini-input" type="number" min="1" max="3600" value="${item.durationSeconds || 15}">
              </label>
            ` : ""}
            <p class="hint">` + (item.type === "video" ? "Bei aktiviertem Haken wird das Video komplett sichtbar gehalten." : "Skalierung wirkt zusätzlich zur gewählten Anzeigeart.") + `</p>
          </div>
        ` : ""}
        ${item.type === "document" ? `
          <div class="document-settings">
            <label>
              PDF-Ansicht
              <select class="document-view-select mini">
                <option value="fit-width" ${item.documentView === "fit-width" ? "selected" : ""}>Breite füllen</option>
                <option value="fit-page" ${item.documentView === "fit-page" ? "selected" : ""}>Seite einpassen</option>
                <option value="actual-size" ${item.documentView === "actual-size" ? "selected" : ""}>Originalgröße</option>
              </select>
            </label>
            <label>
              Startseite
              <input class="document-start-page mini-input" type="number" min="1" value="${item.documentStartPage || 1}">
            </label>
            <label>
              Endseite
              <input class="document-end-page mini-input" type="number" min="1" value="${item.documentEndPage || item.documentStartPage || 1}">
            </label>
            <label>
              Seitenwechsel
              <input class="document-page-advance mini-input" type="number" min="0" max="3600" value="${item.documentPageAdvanceSeconds || 0}">
            </label>
            <label>
              Dauer ohne Wechsel
              <input class="document-duration mini-input" type="number" min="1" max="3600" value="${item.durationSeconds || 8}">
            </label>
            <p class="hint">` + (item.documentPageAdvanceSeconds > 0 ? "Bei Seitenwechsel wird seitenweise automatisch weitergeschaltet." : "Bei 0 bleibt das PDF auf einer Seite und nutzt die Dauer ohne Wechsel.") + `</p>
          </div>
        ` : ""}
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

    if (item.type === "image" || item.type === "video") {
      const saveDisplaySettings = async () => {
        const payload = {
          displayFit: li.querySelector(".display-fit-select").value,
          displayPosition: li.querySelector(".display-position-select").value,
          displayScalePercent: Number(li.querySelector(".display-scale").value)
        };
        if (item.type === "video") {
          payload.videoShowComplete = li.querySelector(".video-show-complete").checked;
          payload.durationSeconds = Number(li.querySelector(".video-duration").value);
        }
        await updateMedia(item.id, payload);
      };

      li.querySelector(".display-fit-select").addEventListener("change", saveDisplaySettings);
      li.querySelector(".display-position-select").addEventListener("change", saveDisplaySettings);
      li.querySelector(".display-scale").addEventListener("change", saveDisplaySettings);
      if (item.type === "video") {
        li.querySelector(".video-show-complete").addEventListener("change", saveDisplaySettings);
        li.querySelector(".video-duration").addEventListener("change", saveDisplaySettings);
      }
    }

    if (item.type === "document") {
      const saveDocumentSettings = async () => {
        const payload = {
          documentView: li.querySelector(".document-view-select").value,
          documentStartPage: Number(li.querySelector(".document-start-page").value),
          documentEndPage: Number(li.querySelector(".document-end-page").value),
          documentPageAdvanceSeconds: Number(li.querySelector(".document-page-advance").value),
          durationSeconds: Number(li.querySelector(".document-duration").value)
        };
        await updateMedia(item.id, payload);
      };

      li.querySelector(".document-view-select").addEventListener("change", saveDocumentSettings);
      li.querySelector(".document-start-page").addEventListener("change", saveDocumentSettings);
      li.querySelector(".document-end-page").addEventListener("change", saveDocumentSettings);
      li.querySelector(".document-page-advance").addEventListener("change", saveDocumentSettings);
      li.querySelector(".document-duration").addEventListener("change", saveDocumentSettings);
    }

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
  const files = [...filesInput.files];
  if (!files.length) {
    setMessage(uploadMessage, "Bitte zuerst Dateien auswählen.", true);
    return;
  }

  try {
    setUploadBusy(true, "Videodaten werden analysiert...", 5);

    const metadata = {};
    let processedDurations = 0;
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));
    for (const file of videoFiles) {
      metadata[file.name] = {
        durationSeconds: await readVideoDuration(file)
      };
      processedDurations += 1;
      const progress = 5 + Math.round((processedDurations / Math.max(videoFiles.length, 1)) * 15);
      setUploadBusy(true, `Videodaten werden analysiert (${processedDurations}/${videoFiles.length})...`, progress);
    }

    const batches = splitIntoBatches(files, UPLOAD_BATCH_SIZE);
    let uploadedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const formData = new FormData();
      const batchMetadata = {};

      for (const file of batch) {
        formData.append("files", file);
        if (metadata[file.name]) {
          batchMetadata[file.name] = metadata[file.name];
        }
      }

      formData.append("metadata", JSON.stringify(batchMetadata));
      setUploadBusy(
        true,
        `Upload Paket ${batchIndex + 1} von ${batches.length} (${uploadedCount + 1}-${uploadedCount + batch.length} von ${files.length})...`,
        20 + Math.round((uploadedCount / files.length) * 75)
      );

      const response = await fetch("/api/media", { method: "POST", body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Upload fehlgeschlagen.");
      }

      uploadedCount += batch.length;
      setUploadBusy(
        true,
        `Upload Paket ${batchIndex + 1} von ${batches.length} abgeschlossen (${uploadedCount}/${files.length})...`,
        20 + Math.round((uploadedCount / files.length) * 75)
      );
    }

    setUploadBusy(true, "Playlist wird aktualisiert...", 98);
    uploadForm.reset();
    await loadMedia();
    setUploadBusy(false, "", 0);
    setMessage(uploadMessage, `${files.length} Datei(en) erfolgreich gespeichert.`);
  } catch (error) {
    setUploadBusy(false, "", 0);
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

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(passwordMessage, "");

  const currentPassword = document.getElementById("currentPasswordInput").value;
  const newPassword = document.getElementById("newPasswordInput").value;
  const confirmPassword = document.getElementById("confirmPasswordInput").value;

  if (newPassword !== confirmPassword) {
    setMessage(passwordMessage, "Die neuen Passwörter stimmen nicht überein.", true);
    return;
  }

  if (newPassword.length < 6) {
    setMessage(passwordMessage, "Das neue Passwort muss mindestens 6 Zeichen lang sein.", true);
    return;
  }

  try {
    await fetchJson("/api/admin/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    passwordForm.reset();
    setMessage(passwordMessage, "Passwort erfolgreich geändert.");
  } catch (error) {
    setMessage(passwordMessage, error.message, true);
  }
});

refreshButton.addEventListener("click", async () => {
  await Promise.all([loadSettings(), loadMedia()]);
});

clearAllButton.addEventListener("click", async () => {
  if (!state.media.length) {
    setMessage(uploadMessage, "Es sind keine Medien zum Löschen vorhanden.", true);
    return;
  }

  const confirmed = window.confirm("Wirklich alle Inhalte löschen? Dabei werden alle hochgeladenen Dateien und Playlist-Einträge entfernt.");
  if (!confirmed) return;

  setMessage(uploadMessage, "");
  clearAllButton.disabled = true;
  clearAllButton.textContent = "Lösche...";

  try {
    await fetchJson("/api/media", { method: "DELETE" });
    await loadMedia();
    setMessage(uploadMessage, "Alle Inhalte wurden gelöscht.");
  } catch (error) {
    setMessage(uploadMessage, error.message, true);
  } finally {
    clearAllButton.disabled = false;
    clearAllButton.textContent = "Alles löschen";
  }
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
