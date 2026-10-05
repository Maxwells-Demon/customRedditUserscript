// ==UserScript==
// @name         CustomRedditUserscript
// @version      2.27
// @description
// @author       levin
// @match        https://*.reddit.com/*
// @include      https://*.reddit.com/*
// @include      https://reddit.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

let thumbnail_width = 50;

(function () {
    function waitForElement(selector, callback) {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            }
        }, 50);
    }

    // ── Filter state ──────────────────────────────────────────────────────────
    const filters = {
        minScore: null,
        maxAge:   null,   // stored in days
        title:    "",
        url:      "",
        flair:    "",
    };

    function getPosts() {
        const candidates = document.querySelectorAll(
            ".thing[data-type='link'], .thing.link, shreddit-post, article[data-testid='post-container'], [data-testid='post-container']"
        );
        const posts = [];
        const seen = new Set();

        candidates.forEach(candidate => {
            let post = candidate;
            if (!post.matches("shreddit-post, .thing")) {
                post = post.querySelector("shreddit-post") || post;
            }
            if (!seen.has(post)) {
                seen.add(post);
                posts.push(post);
            }
        });
        return posts;
    }

    function getPostTitle(post) {
        const attrTitle = post.getAttribute("post-title");
        if (attrTitle) return attrTitle.trim();

        const titleEl = post.querySelector(
            "a.title, a[slot='title'], a[data-testid='post-title'], [id^='post-title']"
        );
        return titleEl ? titleEl.textContent.trim() : "";
    }

    function getPostScore(post) {
        for (const attribute of ["data-score", "score", "upvotes", "vote-score"]) {
            const raw = post.getAttribute(attribute);
            if (raw !== null && raw !== "") {
                const score = parseInt(raw.replace(/,/g, ""), 10);
                if (!isNaN(score)) return score;
            }
        }

        const scoreEl = post.querySelector(
            ".score.unvoted, .score.likes, .score.dislikes, [data-testid='post-score'], [data-testid='vote-score']"
        );
        if (!scoreEl) return null;
        const score = parseInt(scoreEl.textContent.trim().replace(/,/g, ""), 10);
        return isNaN(score) ? null : score;
    }

    function getPostTimestamp(post) {
        let raw = null;
        for (const attribute of ["data-timestamp", "created-timestamp", "post-created-at", "created"]) {
            const value = post.getAttribute(attribute);
            if (value) {
                raw = value;
                break;
            }
        }

        if (!raw) {
            const timeEl = post.querySelector("time[datetime], .live-timestamp[data-ts]");
            if (timeEl) raw = timeEl.getAttribute("datetime") || timeEl.getAttribute("data-ts");
        }

        if (!raw) return null;
        const numeric = Number(raw);
        if (!isNaN(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;

        const parsed = Date.parse(raw);
        return isNaN(parsed) ? null : parsed;
    }

    function getPostUrl(post) {
        for (const attribute of ["data-url", "content-href", "permalink"]) {
            const value = post.getAttribute(attribute);
            if (value) {
                try {
                    return new URL(value, window.location.href).href;
                } catch (_) {
                    return value;
                }
            }
        }

        const linkEl = post.querySelector(
            "a.title, a[slot='outbound-link'], a[data-testid='outbound-link'], a[data-post-click-location='outbound-link']"
        );
        return linkEl ? linkEl.href : "";
    }

    function getPostFlair(post) {
        const flairEl = post.querySelector(
            ".linkflairlabel, .flair, [slot='post-flair'], [slot='flair'], [data-testid='post-flair'], [class*='flair' i]"
        );
        return flairEl ? flairEl.textContent.trim() : "";
    }

    function getPostDuplicateKey(post) {
        for (const attribute of ["data-fullname", "data-post-id", "post-id", "id"]) {
            const value = post.getAttribute(attribute);
            if (value) return "id:" + value;
        }

        const permalink = post.getAttribute("permalink");
        if (permalink) return "permalink:" + permalink;

        const url = getPostUrl(post);
        if (url) return "url:" + url;

        const title = getPostTitle(post).toLowerCase();
        return title ? "title:" + title : null;
    }

    function setPostVisible(post, visible) {
        post.style.setProperty("display", visible ? "" : "none", "important");
    }

    function applyFilters() {
        const now = Date.now();
        const posts = getPosts();
        const visibleKeys = new Set();

        posts.forEach(post => {
            let show = true;

            if (filters.minScore !== null) {
                const score = getPostScore(post);
                if (score === null || score < filters.minScore) show = false;
            }

            if (show && filters.maxAge !== null) {
                const timestamp = getPostTimestamp(post);
                const ageDays = timestamp === null ? Infinity : (now - timestamp) / 86_400_000;
                if (timestamp === null || ageDays > filters.maxAge) show = false;
            }

            if (show && filters.title) {
                if (!getPostTitle(post).toLowerCase().includes(filters.title.toLowerCase())) show = false;
            }

            if (show && filters.url) {
                if (!getPostUrl(post).toLowerCase().includes(filters.url.toLowerCase())) show = false;
            }

            if (show && filters.flair) {
                if (!getPostFlair(post).toLowerCase().includes(filters.flair.toLowerCase())) show = false;
            }

            if (show) {
                const key = getPostDuplicateKey(post);
                if (key) {
                    if (visibleKeys.has(key)) show = false;
                    else visibleKeys.add(key);
                }
            }

            setPostVisible(post, show);
        });
    }

    let filterApplyQueued = false;
    const observer = new MutationObserver(() => {
        if (filterApplyQueued) return;
        filterApplyQueued = true;
        requestAnimationFrame(() => {
            filterApplyQueued = false;
            applyFilters();
        });
    });

    function startFilterObserver() {
        if (!document.body) return;
        observer.observe(document.body, { childList: true, subtree: true });
        applyFilters();
    }

    if (document.body) {
        startFilterObserver();
    } else {
        waitForElement("body", startFilterObserver);
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    function el(tag, cssText, text) {
        const e = document.createElement(tag);
        if (cssText) e.style.cssText = cssText;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    const BASE_INPUT = `
        box-sizing:border-box; background:#111; border:1px solid #555;
        border-radius:3px; color:#eee; font-family:monospace;
        font-size:11px; padding:2px 4px; height:22px;
    `;

    const ROW = `display:flex; flex-direction:row; align-items:center; gap:2px; width:100%;`;

    function makeHR() {
        const hr = document.createElement("hr");
        hr.style.cssText = "border:none; border-top:1px solid #444; margin:4px 0; width:100%;";
        return hr;
    }

    function makeWideBtn(text, onclick) {
        const b = el("button", `
            box-sizing:border-box; width:100%; padding:3px 0; text-align:center;
            background:#2a2a2a; border:1px solid #555; border-radius:3px;
            color:#ccc; cursor:pointer; font-family:monospace; font-size:11px;
            user-select:none; touch-action:manipulation; appearance:none;
        `, text);
        b.type = "button";
        b.onclick = onclick;
        return b;
    }

    // btn that shows its step label, e.g. "10", "1k", "1h"
    function makeStepBtn(label) {
        const b = el("button", `
            box-sizing:border-box; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#aaa; cursor:pointer; font-family:monospace;
            font-size:9px; text-align:center; user-select:none; flex-shrink:0;
            width:20px; height:22px; line-height:20px; padding:0;
            touch-action:manipulation; appearance:none;
        `, label);
        b.type = "button";
        return b;
    }

    // Multi-step stepper:
    //   steps = [{label, step}, ...]   ordered smallest→largest
    //   Minus buttons appear largest→smallest on the left.
    //   Plus  buttons appear smallest→largest on the right.
    function makeMultiStepper(steps, parseFn, formatFn, onChange) {
        const row = el("div", ROW);

        const inp = el("input", BASE_INPUT + "flex:1; min-width:0; text-align:center;");
        inp.type        = "text";
        inp.placeholder = "—";

        function getCurrent() {
            const v = parseFn(inp.value.trim());
            return (inp.value.trim() === "" || isNaN(v)) ? null : v;
        }
        function setValue(v) {
            if (v === null) { inp.value = ""; onChange(null); }
            else {
                const r = Math.round(v * 1000) / 1000;   // up to 3 decimal places
                inp.value = formatFn ? formatFn(r) : r;
                onChange(r);
            }
            applyFilters();
        }

        // − buttons: largest step first (left side)
        [...steps].reverse().forEach(({ label, step }) => {
            const btn = makeStepBtn("−" + label);
            btn.title = "−" + label;
            btn.onclick = () => {
                const c = getCurrent();
                setValue(c === null ? null : Math.max(0, c - step));
            };
            row.appendChild(btn);
        });

        row.appendChild(inp);

        // + buttons: smallest step first (right side)
        steps.forEach(({ label, step }) => {
            const btn = makeStepBtn("+" + label);
            btn.title = "+" + label;
            btn.onclick = () => {
                const c = getCurrent();
                setValue(c === null ? step : c + step);
            };
            row.appendChild(btn);
        });

        inp.addEventListener("input", () => {
            const v = parseFn(inp.value.trim());
            onChange(inp.value.trim() === "" || isNaN(v) ? null : v);
            applyFilters();
        });

        return { el: row, reset: () => setValue(null) };
    }

    function makeTextInput(placeholder, onChange) {
        const inp = el("input", BASE_INPUT + "width:100%; box-sizing:border-box;");
        inp.type        = "text";
        inp.placeholder = placeholder;
        inp.addEventListener("input", () => { onChange(inp.value.trim()); applyFilters(); });
        return { el: inp, reset: () => { inp.value = ""; } };
    }

    // ── Custom account switcher ─────────────────────────────────────────────
    const ACCOUNT_STORAGE_KEY = "customRedditUserscript.accounts";

    function loadAccounts() {
        try {
            const raw = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "[]");
            if (!Array.isArray(raw)) return [];

            const accounts = raw
                .filter(a => a && typeof a.username === "string" && a.username.trim())
                .map(a => ({ username: a.username.trim() }));

            // Remove legacy plaintext passwords left by versions <= 2.12.
            const hadLegacyPasswords = raw.some(a => a && Object.prototype.hasOwnProperty.call(a, "password"));
            if (hadLegacyPasswords) {
                localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
            }

            return accounts;
        } catch (_) {
            return [];
        }
    }

    function saveAccounts(accounts) {
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }

    const PENDING_SWITCH_KEY = "customRedditUserscript.pendingSwitch";
    const PENDING_SWITCH_COOKIE = "customRedditUserscript_pendingSwitch";
    const PENDING_SWITCH_MAX_AGE = 15 * 60 * 1000;

    async function getRedditUsername() {
        try {
            const response = await fetch("/api/me.json?raw_json=1", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) return null;
            const data = await response.json();
            const name = data && data.data && data.data.name;
            return typeof name === "string" && name ? name : null;
        } catch (_) {
            return null;
        }
    }

    function loadPendingSwitch() {
        try {
            const cookie = document.cookie.split("; ").find(part =>
                part.startsWith(PENDING_SWITCH_COOKIE + "=")
            );
            if (cookie) {
                const encoded = cookie.slice(PENDING_SWITCH_COOKIE.length + 1);
                const value = JSON.parse(decodeURIComponent(encoded));
                if (value && typeof value === "object" && value.createdAt &&
                    Date.now() - value.createdAt <= PENDING_SWITCH_MAX_AGE) {
                    return value;
                }
                clearPendingSwitchCookie();
            }
        } catch (_) {
            clearPendingSwitchCookie();
        }

        // Same-origin fallback for browsers that reject the shared-domain cookie.
        try {
            const value = JSON.parse(sessionStorage.getItem(PENDING_SWITCH_KEY) || "null");
            if (!value || typeof value !== "object") return null;
            if (!value.createdAt || Date.now() - value.createdAt > PENDING_SWITCH_MAX_AGE) {
                sessionStorage.removeItem(PENDING_SWITCH_KEY);
                return null;
            }
            return value;
        } catch (_) {
            return null;
        }
    }

    function savePendingSwitchCookie(value) {
        document.cookie =
            PENDING_SWITCH_COOKIE + "=" + encodeURIComponent(JSON.stringify(value)) +
            "; Max-Age=" + Math.floor(PENDING_SWITCH_MAX_AGE / 1000) +
            "; Path=/; Domain=.reddit.com; SameSite=Lax";
    }

    function clearPendingSwitchCookie() {
        document.cookie =
            PENDING_SWITCH_COOKIE + "=; Max-Age=0; Path=/; Domain=.reddit.com; SameSite=Lax";
    }

    function savePendingSwitch(value) {
        savePendingSwitchCookie(value);
        try {
            sessionStorage.setItem(PENDING_SWITCH_KEY, JSON.stringify(value));
        } catch (_) {}
    }

    function clearPendingSwitch() {
        clearPendingSwitchCookie();
        try {
            sessionStorage.removeItem(PENDING_SWITCH_KEY);
        } catch (_) {}
    }

    function isRedditLoginPage() {
        const host = window.location.hostname.toLowerCase();
        const path = window.location.pathname.toLowerCase();
        return (host === "www.reddit.com" ||
                host === "reddit.com" ||
                host === "old.reddit.com") &&
            (path === "/login" || path.startsWith("/login/"));
    }

    function isRedditAuthPage() {
        const host = window.location.hostname.toLowerCase();
        return isRedditLoginPage() ||
            host === "accounts.reddit.com" ||
            host === "auth.reddit.com";
    }

    function getLoginUrl() {
        // Use a stable same-origin callback after authentication. Reddit's
        // current login flow can rewrite/ignore complex dest URLs, while the
        // pending switch cookie already contains the real return URL.
        return "https://www.reddit.com/login/?dest=" +
            encodeURIComponent("https://www.reddit.com/");
    }

    function submitRedditLogoutForm() {
        const form = document.querySelector('form.logout[action$="/logout"]') ||
            document.querySelector('form[action$="/logout"]');
        if (!form) return false;

        // Reddit's old-reddit logout endpoint expects a POST containing the
        // current modhash ("uh"). A plain GET navigation to /logout is not
        // equivalent and may return Method Not Allowed/Forbidden.
        const submit = HTMLFormElement.prototype.submit;
        submit.call(form);
        return true;
    }

    function getLogoutLandingUrl() {
        return "https://old.reddit.com/";
    }

    async function handlePendingSwitch() {
        const pending = loadPendingSwitch();
        if (!pending) return;

        const currentUsername = await getRedditUsername();

        // Manual "Add Account" login: the user chooses the authentication
        // method on Reddit, then the resulting identity is saved automatically.
        if (pending.state === "manual_login") {
            if (!currentUsername) {
                if (isRedditAuthPage()) {
                    window.setTimeout(() => handlePendingSwitch(), 1000);
                }
                return;
            }

            const accounts = loadAccounts();
            if (!accounts.some(a => a.username.toLowerCase() === currentUsername.toLowerCase())) {
                accounts.push({ username: currentUsername });
                saveAccounts(accounts);
            }
            clearPendingSwitch();
            if (pending.returnUrl && pending.returnUrl !== window.location.href) {
                window.location.replace(pending.returnUrl);
            }
            return;
        }

        if (currentUsername &&
            pending.username &&
            currentUsername.toLowerCase() === pending.username.toLowerCase()) {
            clearPendingSwitch();
            if (pending.returnUrl && pending.returnUrl !== window.location.href) {
                window.location.replace(pending.returnUrl);
            }
            return;
        }

        if (isRedditAuthPage()) {
            // Reddit may move authentication between reddit.com and its
            // dedicated auth hosts. Never redirect away while auth is active.
            // authentication. Re-check until the browser session is visible.
            window.setTimeout(() => {
                handlePendingSwitch();
            }, 1000);
            return;
        }

        if (pending.state === "logging_out") {
            // Once the POST logout has completed, continue directly to the
            // normal Reddit login flow.
            if (!currentUsername) {
                savePendingSwitch({ ...pending, state: "login_required" });
                const dest = pending.returnUrl || window.location.href;
                window.location.replace(getLoginUrl());
                return;
            }

            if (window.location.hostname.toLowerCase() === "old.reddit.com") {
                if (submitRedditLogoutForm()) return;
            }

            // The working Reddit logout UI is a POST form on old.reddit.com.
            // Navigate there first if the current page does not expose it.
            if (window.location.hostname.toLowerCase() !== "old.reddit.com") {
                window.location.replace(getLogoutLandingUrl());
                return;
            }

            savePendingSwitch({ ...pending, state: "logout_form_missing" });
            return;
        }

        if (pending.state === "logout_form_missing") {
            if (window.location.hostname.toLowerCase() === "old.reddit.com" &&
                submitRedditLogoutForm()) {
                return;
            }
            return;
        }

        if (window.location.pathname.toLowerCase() === "/logout") {
            savePendingSwitch({ ...pending, state: "login_required" });
            window.setTimeout(() => {
                const latest = loadPendingSwitch();
                if (!latest) return;
                const dest = latest.returnUrl || window.location.origin + "/";
                window.location.replace(getLoginUrl(dest));
            }, 500);
            return;
        }

        if (!currentUsername) {
            if (pending.state === "login_required") {
                savePendingSwitch({ ...pending, state: "login_failed" });
                console.warn("[CustomRedditUserscript] account switch login did not produce an authenticated session.");
                return;
            }

            savePendingSwitch({ ...pending, state: "login_required" });
            window.location.replace(getLoginUrl());
            return;
        }

        // A different account is authenticated. Do not loop automatically:
        // the user may have intentionally logged into the wrong account.
        savePendingSwitch({
            ...pending,
            state: "wrong_account",
            authenticatedUsername: currentUsername
        });
        console.warn(
            "[CustomRedditUserscript] account switch authenticated as wrong account:",
            currentUsername,
            "wanted:",
            pending.username
        );
    }

    async function loginToAccount(account) {
        const username = account.username.trim();
        if (!username) throw new Error("Invalid saved account.");

        const returnUrl = window.location.href;
        const currentUsername = await getRedditUsername();

        if (currentUsername &&
            currentUsername.toLowerCase() === username.toLowerCase()) {
            return;
        }

        savePendingSwitch({
            username,
            returnUrl,
            createdAt: Date.now(),
            state: currentUsername ? "logging_out" : "login_required"
        });

        if (currentUsername) {
            // Use normal browser navigation so Reddit can modify its HttpOnly
            // session cookies. Fetch cannot provide a reliable browser-session
            // replacement for the current Reddit authentication flow.
            window.location.replace(getLogoutLandingUrl());
        } else {
            window.location.href = getLoginUrl();
        }
    }

    // Continue an interrupted browser-authentication switch after navigation.
    handlePendingSwitch();

    // Debug instrumentation: expose startup state and report uncaught setup errors.
    window.__customRedditUserscriptDebug = {
        version: "2.27",
        setupStarted: false,
        setupCompleted: false,
        error: null
    };
    console.debug("[CustomRedditUserscript] v2.27 script loaded");

    // ── Main setup ────────────────────────────────────────────────────────────
    (function setup() {
        window.__customRedditUserscriptDebug.setupStarted = true;
        console.debug("[CustomRedditUserscript] setup started");
        const css = "body{overflow-x:hidden;} #eu-cookie-policy{display:none;} #progressIndicator{flex-grow:1;} body.with-listing-chooser>.content,body.with-listing-chooser .footer-parent{margin-left:100px;} .listing-chooser{position:fixed!important;overflow:auto!important;top:0!important;} .with-listing-chooser .listing-chooser.initialized{width:100px;padding-right:0;} .listing-chooser ul.multis li{margin-bottom:1px;margin-top:0;margin-left:0;border:0 solid #ccc;border-radius:5px;} .listing-chooser ul.multis li a{padding:.2em 1px;padding-left:3px;} .listing-chooser ul.multis li:hover{margin-left:5px;} .listing-chooser li{border-radius:5px;} .listing-chooser .contents{margin-top:0!important;} .listing-chooser li.selected{margin-right:0;padding-right:0;} .promoted{display:none;} .link{margin-bottom:1px;background-color:rgb(0 0 0/25%)!important;width:99%;margin-left:5px;flex-grow:2;} .link .flat-list{padding:0;} .link .title{font-size:small;font-weight:normal;margin-bottom:0;} .noCtrlF{display:none;} .post-crosspost-button{display:none;} .report-button{display:none!important;} .post-sharing-button{display:none;} .give-gold{display:none;} .entry .buttons li+li{padding-left:0;} .entry .buttons li{padding-right:2px;line-height:1em;} .thumbnail{width:70px;margin-right:10px;margin-bottom:0;} .thumbnail img{width:100%!important;height:auto!important;} .rank{display:none;} .midcol-spacer{width:0!important;} .midcol{margin:0!important;} .grippy{display:none!important;} .NERPageMarker{flex-grow:1;width:100%;} .md{max-width:100%;} .usertext-body{width:50%;} .arrow{margin:1px 0 0 0;}";

        const styleEl = document.createElement("style");
        document.head.appendChild(styleEl);
        styleEl.innerHTML = css;

        const thumbCSS = document.createElement("style");
        document.head.appendChild(thumbCSS);

        function applyThumbnailWidth() {
            thumbCSS.textContent =
                `.thumbnail{width:${thumbnail_width}px!important;min-width:${thumbnail_width}px!important;max-width:${thumbnail_width}px!important;}` +
                `.thumbnail img{width:100%!important;max-width:none!important;height:auto!important;}`;
            document.querySelectorAll(".thumbnail").forEach(thumbnail => {
                thumbnail.style.setProperty("width", thumbnail_width + "px", "important");
                thumbnail.style.setProperty("min-width", thumbnail_width + "px", "important");
                thumbnail.style.setProperty("max-width", thumbnail_width + "px", "important");
                const image = thumbnail.querySelector("img");
                if (image) {
                    image.style.setProperty("width", "100%", "important");
                    image.style.setProperty("max-width", "none", "important");
                    image.style.setProperty("height", "auto", "important");
                }
            });
        }

        applyThumbnailWidth();

        const thumbnailObserver = new MutationObserver(() => applyThumbnailWidth());
        if (document.body) {
            thumbnailObserver.observe(document.body, { childList: true, subtree: true });
        }

        const sidebarCSS = document.createElement("style");
        document.head.appendChild(sidebarCSS);
        sidebarCSS.innerHTML = ".side{display:none!important;}";


        // ── Root container fixed to bottom-right ──────────────────────────────
        const root = el("div", `
            position:absolute!important; right:0!important; bottom:0!important;
            z-index:2147483647!important; display:flex!important;
            flex-direction:column!important; align-items:flex-end!important; gap:2px!important;
            width:auto!important; height:auto!important; visibility:visible!important;
            opacity:1!important; pointer-events:auto!important;
        `);
        const uiHost = document.createElement("div");
        uiHost.id = "custom-reddit-userscript-ui";
        uiHost.style.cssText = "all:initial;position:fixed!important;right:20px!important;bottom:20px!important;top:auto!important;left:auto!important;width:208px!important;height:auto!important;min-width:208px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;";
        document.documentElement.appendChild(uiHost);
        const uiRoot = uiHost.attachShadow({mode:"open"});
        const resetStyle = document.createElement("style");
        resetStyle.textContent = ":host{all:initial}*,*::before,*::after{box-sizing:border-box}";
        uiRoot.appendChild(resetStyle);
        uiRoot.appendChild(root);

        // ── Open/close panel button ───────────────────────────────────────────
        // Keep this control outside the hidden panel so it remains visible when
        // the panel is collapsed.
        const collapseBtn = el("button", `
            box-sizing:border-box!important; display:flex!important; align-items:center!important;
            justify-content:center!important; width:32px!important; height:32px!important;
            min-width:32px!important; min-height:32px!important; padding:0!important;
            margin:0!important; line-height:30px!important; flex-shrink:0!important;
            text-align:center!important; background:#ff4500!important; border:2px solid #fff!important;
            border-radius:3px!important; color:#ccc!important; font-family:monospace!important;
            font-size:16px!important; font-weight:normal!important; user-select:none!important;
            box-shadow:0 1px 4px rgba(0,0,0,.4)!important; visibility:visible!important;
            opacity:1!important; pointer-events:auto!important; position:relative!important;
        `, "☰");
        collapseBtn.type = "button";

        // ── Panel (collapsed by default) ──────────────────────────────────────
        const panel = el("div", `
            box-sizing:border-box; display:none; flex-direction:column;
            align-items:stretch; gap:4px; width:200px;
            font-family:monospace; font-size:11px; color:#ccc;
            background:#1a1a1a; border:1px solid #444; border-radius:5px;
            padding:8px; max-height:calc(100vh - 50px); overflow-y:auto;
            -webkit-overflow-scrolling:touch;
        `);

        let panelOpen = false;

        function setPanelOpen(open) {
            panelOpen = open;
            panel.style.display = open ? "flex" : "none";
            collapseBtn.textContent = open ? "✕" : "☰";
        }

        // Desktop: keep the original hover behaviour only on devices that
        // actually have a fine pointer and hover capability. Android browsers
        // can synthesize mouse events for touch input, which would otherwise
        // immediately reopen/close the panel during a tap.
        const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        if (canHover) {
            root.addEventListener("mouseenter", () => setPanelOpen(true));
            root.addEventListener("mouseleave", () => setPanelOpen(false));
        }

        // Touch/mobile and keyboard/mouse: tapping/clicking the menu button
        // explicitly toggles the panel. Do not attach this to the whole root,
        // otherwise tapping a control inside the panel would toggle it too.
        collapseBtn.style.cursor = "pointer";
        collapseBtn.style.touchAction = "manipulation";
        collapseBtn.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            setPanelOpen(!panelOpen);
        });

        // ── RES account selector Android touch compatibility ──────────────────
        // RES registers its account selector on a click handler, but its hover/
        // dropdown implementation is primarily mouse-oriented. On Android,
        // explicitly translate the touch into the same click handler.
        waitForElement("#RESAccountSwitcherIcon", icon => {
            const touchCapable = window.matchMedia("(pointer: coarse)").matches ||
                "ontouchstart" in window;
            if (!touchCapable || icon.dataset.customRedditTouchBridge === "1") return;

            icon.dataset.customRedditTouchBridge = "1";
            icon.addEventListener("touchend", event => {
                event.preventDefault();
                event.stopPropagation();
                icon.click();
            }, { passive: false });
        });

        // ── Thumbnail zoom ────────────────────────────────────────────────────
        const thumbRow      = el("div", ROW);
        const thumbM        = el("div", `
            box-sizing:border-box; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#ccc; cursor:pointer; font-family:monospace;
            font-size:13px; text-align:center; user-select:none;
            width:22px; height:22px; line-height:20px; flex-shrink:0;
        `, "−");
        const thumbValLabel = el("div", "flex:1; text-align:center; font-size:11px; color:#aaa;", thumbnail_width + "px");
        const thumbP        = el("div", `
            box-sizing:border-box; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#ccc; cursor:pointer; font-family:monospace;
            font-size:13px; text-align:center; user-select:none;
            width:22px; height:22px; line-height:20px; flex-shrink:0;
        `, "+");

        thumbM.onclick = () => {
            thumbnail_width = Math.max(20, thumbnail_width - 20);
            thumbValLabel.textContent = thumbnail_width + "px";
            applyThumbnailWidth();
            console.debug("[CustomRedditUserscript] thumbnail width:", thumbnail_width);
        };
        thumbP.onclick = () => {
            thumbnail_width += 20;
            thumbValLabel.textContent = thumbnail_width + "px";
            applyThumbnailWidth();
            console.debug("[CustomRedditUserscript] thumbnail width:", thumbnail_width);
        };
        thumbRow.appendChild(thumbM);
        thumbRow.appendChild(thumbValLabel);
        thumbRow.appendChild(thumbP);
        panel.appendChild(thumbRow);

        // ── Right sidebar toggle ────────────────────────────────────────────────
        panel.appendChild(makeHR());
        let sidebarVisible = false;
        const sideBtn = makeWideBtn("Show Sidebar", () => {
            sidebarVisible = !sidebarVisible;
            sidebarCSS.innerHTML = sidebarVisible ? ".side{display:unset!important;}" : ".side{display:none!important;}";
            sideBtn.textContent  = sidebarVisible ? "Hide Sidebar" : "Show Sidebar";
        });
        panel.appendChild(sideBtn);

        // ── Multireddit sidebar toggle ─────────────────────────────────────────
        const multiredditSidebarBtn = makeWideBtn("Toggle Multireddit Sidebar", () => {
            const grippy = document.querySelector(".listing-chooser .grippy");
            if (grippy) grippy.click();
        });
        panel.appendChild(multiredditSidebarBtn);

        // ── Custom account switcher ───────────────────────────────────────────
        panel.appendChild(makeHR());

        const accountTitle = el("div", "font-weight:bold; text-align:center; color:#aaa;", "Accounts");
        panel.appendChild(accountTitle);

        const accountStatus = el("div", "font-size:10px; color:#888; text-align:center; min-height:12px;");
        panel.appendChild(accountStatus);

        panel.appendChild(el(
            "div",
            "font-size:10px; color:#777; text-align:center; line-height:13px;",
            "Switches use Reddit's normal browser login. No password is stored by this script."
        ));

        const accountAddBtn = makeWideBtn("Add Current Account", async () => {
            const username = await getRedditUsername();
            if (!username) {
                accountStatus.textContent = "Log in first, then add the account.";
                return;
            }

            const accounts = loadAccounts();
            const existing = accounts.findIndex(a =>
                a.username.toLowerCase() === username.toLowerCase()
            );

            if (existing < 0) {
                accounts.push({ username });
            } else {
                accounts[existing] = { username };
            }

            saveAccounts(accounts);
            accountStatus.textContent = existing < 0 ? "Account saved." : "Account already saved.";
            renderAccounts();
        });
        panel.appendChild(accountAddBtn);

        const accountLoginBtn = makeWideBtn("Log In / Add Account", () => {
            const returnUrl = window.location.href;
            savePendingSwitch({
                username: "",
                returnUrl,
                createdAt: Date.now(),
                state: "manual_login"
            });
            window.location.href = getLoginUrl(returnUrl);
        });
        panel.appendChild(accountLoginBtn);

        const accountList = el("div", "display:flex; flex-direction:column; gap:2px; width:100%;");
        panel.appendChild(accountList);

        async function renderAccounts() {
            accountList.textContent = "";
            const accounts = loadAccounts();
            const currentUsername = await getRedditUsername();
            const pending = loadPendingSwitch();
            if (pending && pending.state === "wrong_account") {
                accountStatus.textContent =
                    "Authenticated as u/" + pending.authenticatedUsername +
                    "; wanted u/" + pending.username;
            } else if (pending && pending.state === "login_required") {
                accountStatus.textContent = "Login required for u/" + pending.username + ".";
            } else if (pending && pending.state === "logging_out") {
                accountStatus.textContent = "Logging out before switching to u/" + pending.username + "...";
            } else {
                accountStatus.textContent = currentUsername
                    ? "Current: u/" + currentUsername
                    : "Not logged in.";
            }

            if (pending && (pending.state === "wrong_account" || pending.state === "login_required" || pending.state === "login_failed")) {
                const retryBtn = makeWideBtn("Retry Account Login", async () => {
                    const latest = loadPendingSwitch();
                    if (!latest || !latest.username) return;
                    clearPendingSwitch();
                    accountStatus.textContent = "Retrying...";
                    try {
                        await loginToAccount({ username: latest.username });
                    } catch (error) {
                        accountStatus.textContent = error && error.message
                            ? error.message
                            : "Account switch failed.";
                    }
                });
                accountList.appendChild(retryBtn);

                const cancelBtn = makeWideBtn("Cancel Switch", () => {
                    clearPendingSwitch();
                    accountStatus.textContent = "Account switch cancelled.";
                    renderAccounts();
                });
                accountList.appendChild(cancelBtn);
            }

            if (!accounts.length) {
                accountList.appendChild(el("div", "font-size:10px; color:#777; text-align:center;", "No saved accounts."));
                return;
            }

            accounts.forEach((account, index) => {
                const row = el("div", "display:flex; align-items:center; gap:2px; width:100%;");

                const name = el("div", "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#ccc;", account.username);
                row.appendChild(name);

                const switchBtn = makeWideBtn("Switch", async () => {
                    accountStatus.textContent = "Switching...";
                    try {
                        await loginToAccount(account);
                    } catch (error) {
                        accountStatus.textContent = error && error.message
                            ? error.message
                            : "Account switch failed.";
                    }
                });
                switchBtn.style.width = "55px";
                switchBtn.style.flexShrink = "0";
                row.appendChild(switchBtn);

                const removeBtn = makeWideBtn("×", () => {
                    const current = loadAccounts();
                    current.splice(index, 1);
                    saveAccounts(current);
                    renderAccounts();
                    accountStatus.textContent = "Account removed.";
                });
                removeBtn.title = "Remove saved account";
                removeBtn.style.width = "24px";
                removeBtn.style.flexShrink = "0";
                row.appendChild(removeBtn);

                accountList.appendChild(row);
            });
        }

        renderAccounts();

        // ── Filters ───────────────────────────────────────────────────────────
        panel.appendChild(makeHR());

        const resetters = [];

        // Score: steps 10, 100, 1000
        const scoreSteps = [
            { label: "10",  step: 10   },
            { label: "100", step: 100  },
            { label: "1k",  step: 1000 },
        ];
        const scoreCtrl = makeMultiStepper(
            scoreSteps,
            v => parseInt(v, 10),
            null,
            v => { filters.minScore = v; }
        );
        panel.appendChild(scoreCtrl.el);
        resetters.push(scoreCtrl.reset);

        // Age: steps 1h, 1d, 1 month — stored as days
        const ageSteps = [
            { label: "1h", step: 1 / 24      },
            { label: "1d", step: 1            },
            { label: "1m", step: 30           },
        ];
        const ageCtrl = makeMultiStepper(
            ageSteps,
            v => parseFloat(v),
            v => {
                // display as e.g. "2.5d" or "1.042d" — just round to 2 decimals
                return Math.round(v * 100) / 100;
            },
            v => { filters.maxAge = v; }
        );
        panel.appendChild(ageCtrl.el);
        resetters.push(ageCtrl.reset);

        panel.appendChild(makeHR());

        // Title
        const titleCtrl = makeTextInput("title contains", v => { filters.title = v; });
        panel.appendChild(titleCtrl.el);
        resetters.push(titleCtrl.reset);

        // URL
        const urlCtrl = makeTextInput("url contains", v => { filters.url = v; });
        panel.appendChild(urlCtrl.el);
        resetters.push(urlCtrl.reset);

        // Flair
        const flairCtrl = makeTextInput("flair contains", v => { filters.flair = v; });
        panel.appendChild(flairCtrl.el);
        resetters.push(flairCtrl.reset);

        panel.appendChild(makeHR());
        panel.appendChild(makeWideBtn("Reset filters", () => {
            filters.minScore = null;
            filters.maxAge   = null;
            filters.title    = "";
            filters.url      = "";
            filters.flair    = "";
            resetters.forEach(r => r());
            applyFilters();
        }));

        root.appendChild(panel);
        root.appendChild(collapseBtn);

        // Start collapsed; the bottom-right button remains visible.
        setPanelOpen(false);
        window.__customRedditUserscriptDebug.setupCompleted = true;
        window.__customRedditUserscriptDebug.button = collapseBtn;
        window.__customRedditUserscriptDebug.panel = panel;
        console.debug("[CustomRedditUserscript] setup completed; panel collapsed");
    })();
})();
