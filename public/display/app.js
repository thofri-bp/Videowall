const displayRoot = document.getElementById("displayRoot");
const emptyState = document.getElementById("emptyState");
const stage = document.getElementById("stage");

const state = {
  playlist: [],
  settings: null,
  currentIndex: 0,
  timerIds: [],
  pollId: null,
  currentRenderedId: null
};

function clearTimers() {
  for (const timerId of state.timerIds) {
    clearTimeout(timerId);
  }
  state.timerIds = [];
}

function clearStage() {
  stage.innerHTML = "";
}

function applyBackground(background) {
  const value = background?.value || "linear-gradient(135deg, #020617 0%, #0f172a 45%, #111827 100%)";
  displayRoot.style.setProperty("--background", value);
}

function applyTransition(transition) {
  const transitionName = transition || "fade";
  displayRoot.className = `display-root transition-${transitionName}`;
}

function getDocumentConfig(item) {
  const startPage = Math.max(1, Number(item.documentStartPage || 1));
  const endPage = Math.max(startPage, Number(item.documentEndPage || startPage));
  const pageAdvanceSeconds = Math.max(0, Number(item.documentPageAdvanceSeconds || 0));
  const durationSeconds = Math.max(1, Number(item.durationSeconds || state.settings?.imageDuration || 8));
  const view = item.documentView || "fit-width";
  return { startPage, endPage, pageAdvanceSeconds, durationSeconds, view };
}

function buildPdfUrl(item, page) {
  const config = getDocumentConfig(item);
  const zoom = config.view === "fit-page"
    ? "page-fit"
    : (config.view === "actual-size" ? "100" : "page-width");
  const params = new URLSearchParams({
    toolbar: "0",
    navpanes: "0",
    scrollbar: "0",
    page: String(page),
    zoom
  });
  return `${item.url}#${params.toString()}`;
}

function getDocumentTotalDurationMs(item) {
  const config = getDocumentConfig(item);
  if (config.pageAdvanceSeconds > 0) {
    return (config.endPage - config.startPage + 1) * config.pageAdvanceSeconds * 1000;
  }
  return config.durationSeconds * 1000;
}

function getDisplayConfig(item) {
  const baseFit = item.displayFit || (item.type === "video" ? (state.settings?.videoFit || "max") : "max");
  const normalizedFit = baseFit === "contain" ? "max" : baseFit;
  const videoShowComplete = item.type === "video" && item.videoShowComplete;
  const effectiveFit = videoShowComplete ? "max" : normalizedFit;
  const rawScalePercent = Math.max(10, Number(item.displayScalePercent || 100));
  const effectiveScalePercent = (effectiveFit === "stretch" || videoShowComplete) ? 100 : rawScalePercent;
  return {
    fit: effectiveFit,
    scalePercent: effectiveScalePercent,
    position: item.displayPosition || "center"
  };
}

function getObjectPosition(position) {
  switch (position) {
    case "top":
      return "center top";
    case "bottom":
      return "center bottom";
    case "left":
      return "left center";
    case "right":
      return "right center";
    case "top-left":
      return "left top";
    case "top-right":
      return "right top";
    case "bottom-left":
      return "left bottom";
    case "bottom-right":
      return "right bottom";
    default:
      return "center center";
  }
}

function getPlaceSelf(position) {
  switch (position) {
    case "top":
      return "start center";
    case "bottom":
      return "end center";
    case "left":
      return "center start";
    case "right":
      return "center end";
    case "top-left":
      return "start start";
    case "top-right":
      return "start end";
    case "bottom-left":
      return "end start";
    case "bottom-right":
      return "end end";
    default:
      return "center center";
  }
}

function createMediaNode(item) {
  const shell = document.createElement("div");
  shell.className = "media-shell";
  const frame = document.createElement("div");
  frame.className = "media-frame";
  const rotation = Number(item.rotation || 0);
  const displayConfig = getDisplayConfig(item);
  frame.style.setProperty("--media-scale", `${displayConfig.scalePercent / 100}`);
  frame.style.transform = `rotate(${rotation}deg) scale(var(--media-scale))`;

  if (item.type === "image") {
    const image = document.createElement("img");
    image.className = `media-visual fit-${displayConfig.fit}`;
    image.style.objectPosition = getObjectPosition(displayConfig.position);
    image.style.placeSelf = getPlaceSelf(displayConfig.position);
    image.src = item.url;
    image.alt = item.originalName || "Bild";
    frame.appendChild(image);
    shell.appendChild(frame);
    return { shell, done: null };
  }

  if (item.type === "document") {
    const pdf = document.createElement("iframe");
    pdf.src = buildPdfUrl(item, getDocumentConfig(item).startPage);
    pdf.title = item.originalName || "PDF";
    pdf.loading = "eager";
    frame.appendChild(pdf);
    shell.appendChild(frame);
    return { shell, done: null };
  }

  const video = document.createElement("video");
  video.className = `media-visual fit-${displayConfig.fit}`;
  video.style.objectPosition = getObjectPosition(displayConfig.position);
  video.style.placeSelf = getPlaceSelf(displayConfig.position);
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
  clearTimers();
  clearStage();
  state.currentRenderedId = item.id;

  const { shell, done } = createMediaNode(item);
  stage.appendChild(shell);
  requestAnimationFrame(() => shell.classList.add("active"));

  if (item.type === "image") {
    const duration = Math.max(1, Number(state.settings?.imageDuration || 8)) * 1000;
    state.timerIds.push(window.setTimeout(() => {
      advanceIndependent();
    }, duration));
    return;
  }

  if (item.type === "document") {
    const config = getDocumentConfig(item);
    const pdf = shell.querySelector("iframe");

    if (config.pageAdvanceSeconds > 0 && config.endPage > config.startPage) {
      for (let page = config.startPage + 1; page <= config.endPage; page += 1) {
        const delay = (page - config.startPage) * config.pageAdvanceSeconds * 1000;
        state.timerIds.push(window.setTimeout(() => {
          if (state.currentRenderedId !== item.id || !pdf) return;
          pdf.src = buildPdfUrl(item, page);
        }, delay));
      }
    }

    state.timerIds.push(window.setTimeout(() => {
      advanceIndependent();
    }, getDocumentTotalDurationMs(item)));
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
  clearTimers();

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

  const activeVisual = stage.querySelector("img, iframe");
  if (!activeVisual || state.currentRenderedId !== item.id) {
    clearStage();
    const { shell } = createMediaNode(item);
    stage.appendChild(shell);
    state.currentRenderedId = item.id;
    requestAnimationFrame(() => shell.classList.add("active"));
  }

  if (item.type === "document") {
    const pdf = stage.querySelector("iframe");
    if (!pdf) return;
    const config = getDocumentConfig(item);
    let currentPage = config.startPage;
    if (config.pageAdvanceSeconds > 0) {
      const elapsedSeconds = Math.max(0, (Date.now() - snapshot.startedAt) / 1000);
      const pageOffset = Math.min(
        config.endPage - config.startPage,
        Math.floor(elapsedSeconds / config.pageAdvanceSeconds)
      );
      currentPage = config.startPage + pageOffset;
    }
    const nextSrc = buildPdfUrl(item, currentPage);
    if (pdf.getAttribute("src") !== nextSrc) {
      pdf.src = nextSrc;
    }
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
    clearTimers();
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
