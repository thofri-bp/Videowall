const displayRoot = document.getElementById("displayRoot");
const emptyState = document.getElementById("emptyState");
const stage = document.getElementById("stage");

const state = {
  playlist: [],
  settings: null,
  currentIndex: 0,
  timerId: null,
  pollId: null,
  currentRenderedId: null
};

function clearStage() {
  stage.innerHTML = "";
}

function applyBackground(background) {
  const value = background?.value || "linear-gradient(135deg, #020617 0%, #0f172a 45%, #111827 100%)";
  displayRoot.style.setProperty("--background", value);
}

function applyTransition(transition) {
  const transitionName = transition || "fade";
  const videoFit = state.settings?.videoFit || "contain";
  displayRoot.className = `display-root transition-${transitionName} video-fit-${videoFit}`;
}

function createMediaNode(item) {
  const shell = document.createElement("div");
  shell.className = "media-shell";
  const frame = document.createElement("div");
  frame.className = "media-frame";
  const rotation = Number(item.rotation || 0);
  frame.style.transform = `rotate(${rotation}deg)`;

  if (item.type === "image") {
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.originalName || "Bild";
    frame.appendChild(image);
    shell.appendChild(frame);
    return { shell, done: null };
  }

  const video = document.createElement("video");
  video.src = item.url;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  frame.appendChild(video);
  shell.appendChild(frame);

  const done = new Promise((resolve) => {
    video.addEventListener("ended", resolve, { once: true });
    video.addEventListener("error", resolve, { once: true });
  });

  return { shell, done };
}

async function showItem(item) {
  clearTimeout(state.timerId);
  clearStage();
  state.currentRenderedId = item.id;

  const { shell, done } = createMediaNode(item);
  stage.appendChild(shell);
  requestAnimationFrame(() => shell.classList.add("active"));

  if (item.type === "image") {
    const duration = Math.max(1, Number(state.settings?.imageDuration || 8)) * 1000;
    state.timerId = window.setTimeout(() => {
      advanceIndependent();
    }, duration);
    return;
  }

  const video = shell.querySelector("video");
  try {
    await video.play();
  } catch {
    // autoplay may be blocked; browser interaction can resume it later
  }
  await done;
  advanceIndependent();
}

async function advanceIndependent() {
  if (!state.playlist.length || state.settings?.syncMode !== "independent") return;
  state.currentIndex = (state.currentIndex + 1) % state.playlist.length;
  await showItem(state.playlist[state.currentIndex]);
}

async function renderSync(snapshot) {
  const item = snapshot.currentItem;
  if (!item) {
    clearStage();
    state.currentRenderedId = null;
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  clearTimeout(state.timerId);

  if (state.currentRenderedId !== item.id || !stage.children.length) {
    clearStage();
    const { shell } = createMediaNode(item);
    stage.appendChild(shell);
    state.currentRenderedId = item.id;
    requestAnimationFrame(() => shell.classList.add("active"));
  }

  if (item.type === "video") {
    const video = stage.querySelector("video");
    if (!video) return;
    const offsetSeconds = Math.max(0, (Date.now() - snapshot.startedAt) / 1000);
    const driftSeconds = Math.abs(video.currentTime - offsetSeconds);
    if (driftSeconds > 0.75 && Number.isFinite(video.duration) && offsetSeconds < video.duration) {
      video.currentTime = offsetSeconds;
    }
    if (video.paused) {
      try {
        await video.play();
      } catch {
        // ignore autoplay failure
      }
    }
    return;
  }

  const activeImage = stage.querySelector("img");
  if (!activeImage || state.currentRenderedId !== item.id) {
    clearStage();
    const { shell } = createMediaNode(item);
    stage.appendChild(shell);
    state.currentRenderedId = item.id;
    requestAnimationFrame(() => shell.classList.add("active"));
  }
}

async function bootstrapIndependent(snapshot) {
  state.playlist = snapshot.playlist || [];
  if (!state.playlist.length) {
    clearStage();
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  const startIndex = Number(snapshot.currentIndex || 0) % state.playlist.length;
  state.currentIndex = startIndex;
  await showItem(state.playlist[state.currentIndex]);
}

async function refresh() {
  const response = await fetch("/api/playback");
  const snapshot = await response.json();
  const previousMode = state.settings?.syncMode;
  state.settings = snapshot.settings;
  applyBackground(snapshot.settings.background);
  applyTransition(snapshot.settings.transition);

  if (!snapshot.playlist.length) {
    state.playlist = [];
    clearTimeout(state.timerId);
    clearStage();
    state.currentRenderedId = null;
    emptyState.classList.remove("hidden");
    return;
  }

  if (snapshot.settings.syncMode === "sync") {
    await renderSync(snapshot);
    return;
  }

  const playlistChanged = JSON.stringify(snapshot.playlist.map((item) => item.id)) !== JSON.stringify(state.playlist.map((item) => item.id));
  const modeChanged = previousMode !== "independent";
  state.playlist = snapshot.playlist;
  if (playlistChanged || modeChanged || !stage.children.length) {
    await bootstrapIndependent(snapshot);
  }
}

async function main() {
  await refresh();
  state.pollId = window.setInterval(() => {
    refresh().catch(() => {
      // retry on next poll
    });
  }, 3000);
}

main().catch(() => {
  emptyState.classList.remove("hidden");
});
