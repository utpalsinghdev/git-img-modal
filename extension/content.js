(() => {
  const ROOT_ID = "github-image-preview-root";
  const PRELOAD_COUNT = 5;
  const ZOOM_STEP = 1.25;
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;
  const IMAGE_PATH = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp|ico|tiff?)(?:$|[?#])/i;
  const EXCLUDED = "button, input, select, textarea, summary, [role=button], [role=link], [contenteditable=true], .avatar, .avatar-user, .user-avatar, .profile, .profile-link, .site-header, .Header, .AppHeader, nav, header, [aria-label*=navigation i]";
  let viewer;

  function isExcluded(img) {
    return Boolean(img.closest(EXCLUDED) || img.closest("a")?.matches(EXCLUDED) ||
      /(?:^|[\s_-])(?:logo|brand)(?:$|[\s_-])/i.test(`${img.getAttribute("alt") || ""} ${img.getAttribute("title") || ""} ${img.className || ""}`) ||
      /(?:^|\/)(?:logo|brand)[^/]*\.(?:svg|png|jpe?g|webp)(?:$|[?#])/i.test(img.currentSrc || img.src));
  }

  function normalizeImageURL(raw) {
    if (!raw) return "";
    let url;
    try { url = new URL(raw, location.href); } catch { return ""; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (/^(?:www\.)?github\.com$/i.test(url.hostname) && /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)) {
      url.searchParams.set("raw", "true");
      return url.href;
    }
    return url.href;
  }

  function isImageTarget(raw) {
    if (!raw) return false;
    let url;
    try { url = new URL(raw, location.href); } catch { return false; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (IMAGE_PATH.test(url.href)) return true;
    const host = url.hostname.toLowerCase();
    return /(^|\.)githubusercontent\.com$/.test(host) ||
      /(^|\.)githubassets\.com$/.test(host) && /(?:\/assets\/|\/user-attachments\/)/i.test(url.pathname) ||
      host === "github.com" && /\/user-attachments\/assets\//i.test(url.pathname) ||
      /(^|\.)githubusercontent\.com$/.test(host) && /\/github-production-user-asset-/i.test(url.pathname);
  }

  function originalFor(img, link) {
    const linked = link && isImageTarget(link.href) ? normalizeImageURL(link.href) : "";
    if (linked) return linked;
    const src = img.currentSrc || img.src;
    return normalizeImageURL(src);
  }

  function eligible(img, link) {
    if (!img || img.nodeName !== "IMG" || !img.isConnected || isExcluded(img)) return false;
    if (link && !isImageTarget(link.href)) return false;
    return Boolean(originalFor(img, link));
  }

  function collectImages(clicked, clickedLink) {
    const items = new Map();
    const clickedSource = originalFor(clicked, clickedLink);
    for (const img of document.querySelectorAll("img")) {
      const link = img === clicked ? clickedLink : img.closest("a");
      if (!eligible(img, link)) continue;
      if (img !== clicked && !img.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) continue;
      const source = originalFor(img, link);
      if (!items.has(source) || img === clicked) {
        items.set(source, {
          source,
          fallback: img.currentSrc || img.src,
          caption: (img.getAttribute("alt") || img.getAttribute("title") || "").trim()
        });
      }
    }
    if (!items.has(clickedSource)) {
      items.set(clickedSource, {
        source: clickedSource,
        fallback: clicked.currentSrc || clicked.src,
        caption: (clicked.getAttribute("alt") || clicked.getAttribute("title") || "").trim()
      });
    }
    return { items: [...items.values()], index: [...items.keys()].indexOf(clickedSource) };
  }

  function prepareImage(item) {
    const image = new Image();
    image.className = "image";
    image.alt = item.caption || "Image preview";
    image.decoding = "async";
    image.fetchPriority = "low";
    let state = "loading";
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const finish = result => {
      if (state !== "loading") return;
      state = result;
      image.onload = image.onerror = null;
      resolveReady();
    };
    image.onload = () => {
      image.decode().then(
        () => finish("ready"),
        () => finish(image.naturalWidth > 0 ? "ready" : "error")
      );
    };
    image.onerror = () => {
      if (item.fallback && image.src !== item.fallback) image.src = item.fallback;
      else finish("error");
    };
    image.src = item.source;
    return {
      image, ready,
      get state() { return state; },
      cancel() { finish("cancelled"); image.removeAttribute("src"); }
    };
  }

  function createViewer(gallery) {
    let index = gallery.index;
    let zoom = null;
    let activeRequest = 0;
    const cache = new Map();
    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme:dark; font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      * { box-sizing:border-box; }
      [hidden] { display:none !important; }
      .backdrop { --edge:clamp(12px,3vw,28px); position:fixed; inset:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; width:100vw; height:100dvh; max-width:none; max-height:none; margin:0; border:0; padding:var(--edge); background:rgba(5,8,13,.94); color:#eef3fa; color-scheme:dark; font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; backdrop-filter:blur(12px); }
      .toolbar,.footer { display:flex; align-items:center; gap:9px; width:min(100%,1500px); margin:auto; }
      .toolbar { justify-content:flex-end; min-height:36px; }
      .counter { margin-right:auto; color:#b9c3d1; font-size:12px; font-variant-numeric:tabular-nums; }
      .footer { justify-content:space-between; min-height:36px; color:#b9c3d1; }
      button,.original { min-height:30px; padding:0 10px; border:1px solid #465264; border-radius:7px; background:#202a38; color:#f4f7fb; font:inherit; font-size:12px; text-decoration:none; cursor:pointer; }
      button:hover,.original:hover { background:#2b384a; border-color:#77869a; }
      button:focus-visible,.original:focus-visible { outline:2px solid #83b7ff; outline-offset:3px; }
      .close,.arrow { width:30px; padding:0; font-size:18px; }
      .stage { position:relative; display:grid; place-items:center; min-height:0; height:100%; width:min(100%,1500px); margin:auto; overflow:hidden; }
      .image { display:block; max-width:100%; max-height:calc(100dvh - 72px - var(--edge) - var(--edge)); object-fit:contain; border-radius:3px; box-shadow:0 24px 80px rgba(0,0,0,.42); }
      .stage.full { display:block; overflow:auto; }
      .image.full { max-width:none; max-height:none; margin:auto; }
      .status { position:absolute; inset:auto 0 12px; margin:auto; width:max-content; max-width:90%; padding:7px 11px; border:1px solid #3d4857; border-radius:8px; background:#18202b; color:#d5deea; text-align:center; }
      .caption { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .caption:empty { display:none; }
      @media(max-width:520px) { .backdrop { --edge:10px; } .footer { font-size:12px; } .original { padding:0 9px; } }
    `;
    const backdrop = document.createElement("dialog");
    backdrop.className = "backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Image preview");
    backdrop.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Escape");
    const toolbar = document.createElement("div"); toolbar.className = "toolbar";
    const counter = document.createElement("span"); counter.className = "counter"; counter.setAttribute("role", "status"); counter.setAttribute("aria-live", "polite"); counter.setAttribute("aria-atomic", "true");
    const previous = document.createElement("button"); previous.type = "button"; previous.className = "arrow"; previous.textContent = "‹"; previous.setAttribute("aria-label", "Previous image"); previous.setAttribute("aria-keyshortcuts", "ArrowLeft"); previous.title = "Previous image (←)";
    const next = document.createElement("button"); next.type = "button"; next.className = "arrow"; next.textContent = "›"; next.setAttribute("aria-label", "Next image"); next.setAttribute("aria-keyshortcuts", "ArrowRight"); next.title = "Next image (→)";
    previous.hidden = next.hidden = gallery.items.length < 2;
    const fit = document.createElement("button"); fit.type = "button"; fit.textContent = "100%"; fit.setAttribute("aria-pressed", "false"); fit.setAttribute("aria-label", "View image at 100 percent");
    const close = document.createElement("button"); close.type = "button"; close.className = "close"; close.textContent = "×"; close.setAttribute("aria-label", "Close image preview"); close.setAttribute("aria-keyshortcuts", "Escape"); close.title = "Close (Esc)";
    toolbar.append(counter, previous, next, fit, close);
    const stage = document.createElement("div"); stage.className = "stage";
    let image = document.createElement("img"); image.className = "image"; image.alt = "";
    const status = document.createElement("div"); status.className = "status"; status.setAttribute("role", "status"); status.textContent = "Loading image…";
    stage.append(image, status);
    const footer = document.createElement("div"); footer.className = "footer";
    const caption = document.createElement("div"); caption.className = "caption";
    const original = document.createElement("a"); original.className = "original"; original.textContent = "Open original ↗"; original.target = "_blank"; original.rel = "noopener noreferrer";
    footer.append(caption, original);
    backdrop.append(toolbar, stage, footer); shadow.append(style, backdrop);

    function warmImages(direction) {
      const wanted = new Set([index]);
      for (let distance = 1; distance <= PRELOAD_COUNT; distance++) {
        wanted.add((index + direction * distance + gallery.items.length * PRELOAD_COUNT) % gallery.items.length);
        wanted.add((index - direction * distance + gallery.items.length * PRELOAD_COUNT) % gallery.items.length);
      }
      for (const [key, entry] of cache) {
        if (wanted.has(key)) continue;
        entry.cancel(); cache.delete(key);
      }
      for (const key of wanted) {
        if (!cache.has(key)) cache.set(key, prepareImage(gallery.items[key]));
      }
      cache.get(index).image.fetchPriority = "high";
    }

    function applyZoom(requestedZoom) {
      if (image.hidden || !image.naturalWidth) return;
      const oldWidth = image.getBoundingClientRect().width;
      const oldHeight = image.getBoundingClientRect().height;
      const centerX = oldWidth > stage.clientWidth ? (stage.scrollLeft + stage.clientWidth / 2) / oldWidth : 0.5;
      const centerY = oldHeight > stage.clientHeight ? (stage.scrollTop + stage.clientHeight / 2) / oldHeight : 0.5;
      zoom = requestedZoom === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
      const fitted = zoom === null;
      const width = image.naturalWidth * (zoom ?? 1);
      const height = image.naturalHeight * (zoom ?? 1);
      image.style.width = fitted ? "" : `${width}px`;
      image.style.height = fitted ? "" : `${height}px`;
      image.classList.toggle("full", !fitted);
      stage.classList.toggle("full", !fitted && (width > stage.clientWidth || height > stage.clientHeight));
      stage.scrollTo(Math.max(0, width * centerX - stage.clientWidth / 2), Math.max(0, height * centerY - stage.clientHeight / 2));
      fit.textContent = fitted ? "100%" : "Fit";
      fit.setAttribute("aria-pressed", String(!fitted));
      fit.setAttribute("aria-label", fitted ? "View image at 100 percent" : "Fit image to window");
      const percentage = Math.round((zoom ?? image.getBoundingClientRect().width / image.naturalWidth) * 100);
      fit.title = `Zoom ${percentage}%. ↑ zoom in, ↓ zoom out. Click to ${fitted ? "view actual size" : "fit image"}.`;
    }

    function render(requestedIndex, direction = 1) {
      const request = ++activeRequest;
      index = (requestedIndex + gallery.items.length) % gallery.items.length;
      const item = gallery.items[index];
      warmImages(direction);
      const entry = cache.get(index);
      image.replaceWith(entry.image);
      image = entry.image;
      counter.textContent = `${index + 1} / ${gallery.items.length}`;
      counter.setAttribute("aria-label", `Image ${index + 1} of ${gallery.items.length}`);
      caption.textContent = item.caption;
      original.href = item.source;
      image.alt = item.caption || `Image ${index + 1}`;
      image.hidden = entry.state !== "ready";
      zoom = null;
      image.style.width = image.style.height = "";
      image.classList.remove("full"); stage.classList.remove("full");
      stage.scrollTo(0, 0);
      fit.textContent = "100%"; fit.setAttribute("aria-pressed", "false"); fit.setAttribute("aria-label", "View image at 100 percent");
      fit.title = "↑ zoom in, ↓ zoom out. Click to view actual size.";
      fit.disabled = entry.state !== "ready";
      status.textContent = "Loading image…"; status.hidden = entry.state === "ready";
      entry.ready.then(() => {
        if (request !== activeRequest) return;
        image.hidden = entry.state !== "ready";
        fit.disabled = entry.state !== "ready";
        status.hidden = entry.state === "ready";
        if (entry.state === "error") status.textContent = "Image could not be loaded.";
      });
    }

    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const teardown = () => {
      activeRequest++;
      for (const entry of cache.values()) entry.cancel();
      cache.clear();
      backdrop.close();
      host.remove(); document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
      viewer = null;
    };
    const onKeyDown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); teardown(); return; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          if (gallery.items.length > 1) render(index + direction, direction);
        } else if (!image.hidden && image.naturalWidth) {
          const currentZoom = zoom ?? image.getBoundingClientRect().width / image.naturalWidth;
          applyZoom(currentZoom * (event.key === "ArrowUp" ? ZOOM_STEP : 1 / ZOOM_STEP));
        }
        return;
      }
      if (event.key !== "Tab") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const controls = [previous, next, fit, close, original].filter(control => !control.hidden && !control.disabled);
      const focusedIndex = controls.indexOf(shadow.activeElement);
      controls[(focusedIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    };
    close.addEventListener("click", teardown);
    previous.addEventListener("click", () => render(index - 1, -1));
    next.addEventListener("click", () => render(index + 1));
    fit.addEventListener("click", () => applyZoom(zoom === null ? 1 : null));
    backdrop.addEventListener("click", event => { if (event.target === backdrop || event.target === stage) teardown(); });
    document.addEventListener("keydown", onKeyDown, true);
    document.documentElement.append(host);
    backdrop.showModal();
    render(index);
    close.focus({ preventScroll: true });
    return { teardown };
  }

  function show(img, link) {
    if (viewer) viewer.teardown();
    viewer = createViewer(collectImages(img, link));
  }

  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const path = event.composedPath();
    const img = path.find(node => node instanceof HTMLImageElement);
    if (!img) return;
    const link = path.find(node => node instanceof HTMLAnchorElement) || img.closest("a");
    if (!eligible(img, link)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    show(img, link);
  }

  window.addEventListener("click", onClick, true);
  const closeForNavigation = () => viewer?.teardown();
  window.addEventListener("pagehide", closeForNavigation);
  window.addEventListener("popstate", closeForNavigation);
  window.addEventListener("hashchange", closeForNavigation);
})();
