// ==UserScript==
// @name         CustomRedditUserscript
// @version      2.29
// @description
// @author       levin
// @match        https://*.reddit.com/*
// @include      https://*.reddit.com/*
// @include      https://reddit.com/*
// @grant        GM.cookie
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
    const SNAPSHOT_SCHEMA_VERSION = 1;
    const SWITCH_STATE_KEY = "customRedditUserscript.snapshotSwitch";
    const SCRIPT_STORAGE_PREFIX = "customRedditUserscript.";

    function hasCookieApi() {
        return typeof GM !== "undefined" && GM && GM.cookie &&
            typeof GM.cookie.list === "function" &&
            typeof GM.cookie.set === "function" &&
            typeof GM.cookie.delete === "function";
    }

    async function listRedditCookies() {
        if (!hasCookieApi()) throw new Error("Cookie API unavailable. Enable Tampermonkey cookie access.");
        const cookies = await GM.cookie.list({ domain: ".reddit.com" });
        const unique = new Map();
        (Array.isArray(cookies) ? cookies : []).forEach(cookie => {
            if (!cookie || !cookie.name || !cookie.domain) return;
            const key = [cookie.domain, cookie.path || "/", cookie.name,
                cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : ""].join("|");
            unique.set(key, cookie);
        });
        return Array.from(unique.values());
    }

    function getCookieUrl(cookie) {
        return "https://" + String(cookie.domain || "").replace(/^\./, "") + (cookie.path || "/");
    }

    function snapshotStorage(storage) {
        const data = {};
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && !key.startsWith(SCRIPT_STORAGE_PREFIX)) data[key] = storage.getItem(key);
        }
        return data;
    }

    function restoreStorage(storage, data) {
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && !key.startsWith(SCRIPT_STORAGE_PREFIX)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
        Object.entries(data || {}).forEach(([key, value]) => storage.setItem(key, value));
    }

    function loadAccounts() {
        try {
            const raw = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "[]");
            if (!Array.isArray(raw)) return [];
            return raw.filter(a => a && typeof a.username === "string" && a.username.trim())
                .map(a => ({ username: a.username.trim(), snapshot: a.snapshot || null }));
        } catch (_) { return []; }
    }

    function saveAccounts(accounts) {
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }

    async function captureCurrentSession() {
        if (!hasCookieApi()) throw new Error("Cookie access is unavailable. Enable Tampermonkey cookie access.");
        const cookies = await listRedditCookies();
        if (!cookies.length) throw new Error("No Reddit cookies were accessible. Enable HttpOnly cookie access in Tampermonkey.");
        return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            capturedAt: Date.now(),
            origin: window.location.origin,
            cookies: cookies.map(cookie => ({
                domain: cookie.domain, expirationDate: cookie.expirationDate,
                firstPartyDomain: cookie.firstPartyDomain, hostOnly: cookie.hostOnly,
                httpOnly: cookie.httpOnly, name: cookie.name, path: cookie.path,
                partitionKey: cookie.partitionKey, sameSite: cookie.sameSite,
                secure: cookie.secure, session: cookie.session, value: cookie.value
            })),
            localStorage: snapshotStorage(localStorage),
            sessionStorage: snapshotStorage(sessionStorage)
        };
    }

    async function clearRedditCookies() {
        const cookies = await listRedditCookies();
        await Promise.all(cookies.map(cookie => {
            const details = { url: getCookieUrl(cookie), name: cookie.name };
            if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
            return GM.cookie.delete(details);
        }));
    }

    async function restoreRedditCookies(cookies) {
        for (const cookie of cookies || []) {
            const details = {
                url: getCookieUrl(cookie), name: cookie.name, value: cookie.value,
                path: cookie.path || "/", secure: !!cookie.secure, httpOnly: !!cookie.httpOnly
            };
            if (!cookie.hostOnly && cookie.domain) details.domain = cookie.domain;
            if (cookie.expirationDate) details.expirationDate = cookie.expirationDate;
            if (cookie.firstPartyDomain) details.firstPartyDomain = cookie.firstPartyDomain;
            if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
            if (cookie.sameSite) details.sameSite = cookie.sameSite;
            await GM.cookie.set(details);
        }
    }

    function updateAccountSnapshot(username, snapshot) {
        const accounts = loadAccounts();
        const index = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
        const account = { username, snapshot };
        if (index < 0) accounts.push(account); else accounts[index] = account;
        saveAccounts(accounts);
    }

    function saveSnapshotSwitch(value) { localStorage.setItem(SWITCH_STATE_KEY, JSON.stringify(value)); }
    function clearSnapshotSwitch() { localStorage.removeItem(SWITCH_STATE_KEY); }

    async function restoreAccountSnapshot(account) {
        const snapshot = account && account.snapshot;
        if (!snapshot) throw new Error("No saved session snapshot for u/" + (account && account.username || "unknown") + ".");
        if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("Unsupported session snapshot version.");
        await clearRedditCookies();
        restoreStorage(localStorage, snapshot.localStorage || {});
        restoreStorage(sessionStorage, snapshot.sessionStorage || {});
        await restoreRedditCookies(snapshot.cookies || []);
    }

    async function verifyCurrentAccount(expectedUsername) {
        const actual = await getRedditUsername();
        return !!actual && !!expectedUsername && actual.toLowerCase() === expectedUsername.toLowerCase();
    }

    async function saveCurrentAccountSession() {
        const username = await getRedditUsername();
        if (!username) throw new Error("Log in to Reddit before saving an account.");
        updateAccountSnapshot(username, await captureCurrentSession());
        return username;
    }

    async function switchToAccount(account) {
        const targetUsername = account.username.trim();
        if (!targetUsername) throw new Error("Invalid saved account.");
        if (!hasCookieApi()) throw new Error("Cookie API unavailable. Enable Tampermonkey cookie access.");
        const currentUsername = await getRedditUsername();
        if (currentUsername && currentUsername.toLowerCase() === targetUsername.toLowerCase()) return;
        if (!account.snapshot) throw new Error("Save this account session before switching to it.");

        let currentSnapshot = null;
        if (currentUsername) {
            currentSnapshot = await captureCurrentSession();
            updateAccountSnapshot(currentUsername, currentSnapshot);
        }
        saveSnapshotSwitch({ username: targetUsername, previousUsername: currentUsername || "",
            previousSnapshot: currentSnapshot, createdAt: Date.now() });
        await restoreAccountSnapshot(account);
        if (!await verifyCurrentAccount(targetUsername)) {
            if (currentSnapshot) await restoreAccountSnapshot({ username: currentUsername, snapshot: currentSnapshot });
            clearSnapshotSwitch();
            throw new Error("Session restore failed; previous session was restored.");
        }
        clearSnapshotSwitch();
        window.location.reload();
    }

    // Snapshot switching never logs out through Reddit; the browser session is restored directly.
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
