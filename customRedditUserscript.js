// ==UserScript==
// @name         CustomRedditUserscript
// @version        2.36
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
    const ADD_ACCOUNT_STATE_KEY = "customRedditUserscript.addAccount";
    const SCRIPT_STORAGE_PREFIX = "customRedditUserscript.";

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
            const username = data && data.data && data.data.name;
            return typeof username === "string" && username.trim() ? username.trim() : null;
        } catch (_) {
            return null;
        }
    }

    function hasCookieApi() {
        return typeof GM !== "undefined" && GM && GM.cookie &&
            typeof GM.cookie.list === "function" &&
            typeof GM.cookie.set === "function" &&
            typeof GM.cookie.delete === "function";
    }

    async function listRedditCookies() {
        if (!hasCookieApi()) throw new Error("Cookie API unavailable. Enable Tampermonkey cookie access.");

        const requests = [
            { domain: ".reddit.com" },
            { url: "https://www.reddit.com/" },
            { url: "https://old.reddit.com/" }
        ];
        const unique = new Map();

        for (const request of requests) {
            let cookies = [];
            try {
                cookies = await GM.cookie.list(request);
            } catch (_) {
                continue;
            }
            (Array.isArray(cookies) ? cookies : []).forEach(cookie => {
                if (!cookie || !cookie.name || !cookie.domain) return;
                const key = [
                    cookie.domain, cookie.path || "/", cookie.name,
                    cookie.firstPartyDomain || "",
                    cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : ""
                ].join("|");
                unique.set(key, cookie);
            });
        }

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

        for (const cookie of cookies) {
            const details = {
                url: getCookieUrl(cookie),
                name: cookie.name
            };
            if (cookie.firstPartyDomain) details.firstPartyDomain = cookie.firstPartyDomain;
            if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;

            try {
                await GM.cookie.delete(details);
            } catch (_) {
                // Continue clearing the remaining Reddit cookies.
            }
        }

        // Do not send the user to Reddit's login page while an authenticated
        // Reddit session is still present. This is the failure mode that
        // produces Reddit's "already logged in" interstitial.
        const stillLoggedIn = await getRedditUsername();
        if (stillLoggedIn) {
            throw new Error(
                "Could not clear the current Reddit session. Enable Tampermonkey cookie access (including HttpOnly cookies) and try again."
            );
        }
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
        if (index < 0) accounts.push(account);
        else accounts[index] = account;
        saveAccounts(accounts);
    }

    function saveSnapshotSwitch(value) {
        localStorage.setItem(SWITCH_STATE_KEY, JSON.stringify(value));
    }

    function clearSnapshotSwitch() {
        localStorage.removeItem(SWITCH_STATE_KEY);
    }

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

        saveSnapshotSwitch({
            operation: "switch",
            username: targetUsername,
            previousUsername: currentUsername || "",
            previousSnapshot: currentSnapshot,
            returnUrl: window.location.href,
            phase: "restore-target",
            attempts: 0,
            createdAt: Date.now()
        });

        await restoreAccountSnapshot(account);

        // Cookie changes are made by the userscript manager, not the page.
        // Verify only after a full navigation so Reddit uses the restored
        // cookie jar for a new request.
        window.location.replace(window.location.href);
    }

    // Debug instrumentation: expose startup state and report uncaught setup errors.
    window.__customRedditUserscriptDebug = {
        version: "2.36",
        setupStarted: false,
        setupCompleted: false,
        error: null
    };
    console.debug("[CustomRedditUserscript] v2.36 script loaded");

    function loadSnapshotState(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            if (!value || typeof value !== "object") return null;
            if (!value.createdAt || Date.now() - value.createdAt > 15 * 60 * 1000) {
                localStorage.removeItem(key);
                return null;
            }
            return value;
        } catch (_) {
            return null;
        }
    }

    function loadSnapshotSwitch() {
        return loadSnapshotState(SWITCH_STATE_KEY);
    }

    function saveAddAccountState(value) {
        localStorage.setItem(ADD_ACCOUNT_STATE_KEY, JSON.stringify(value));
    }

    function clearAddAccountState() {
        localStorage.removeItem(ADD_ACCOUNT_STATE_KEY);
    }

    function loadAddAccountState() {
        return loadSnapshotState(ADD_ACCOUNT_STATE_KEY);
    }

    function clearNonScriptStorage(storage) {
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && !key.startsWith(SCRIPT_STORAGE_PREFIX)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
    }

    async function beginAddAccount() {
        if (!hasCookieApi()) throw new Error("Cookie API unavailable. Enable Tampermonkey cookie access.");
        const currentUsername = await getRedditUsername();
        if (!currentUsername) throw new Error("Log in to the current Reddit account first.");

        const currentSnapshot = await captureCurrentSession();
        updateAccountSnapshot(currentUsername, currentSnapshot);

        saveAddAccountState({
            operation: "add-account",
            previousUsername: currentUsername,
            previousSnapshot: currentSnapshot,
            returnUrl: window.location.href,
            phase: "login",
            createdAt: Date.now()
        });

        await clearRedditCookies();
        clearNonScriptStorage(localStorage);
        clearNonScriptStorage(sessionStorage);

        window.location.href = "https://www.reddit.com/login/";
    }

    async function recoverInterruptedSnapshotSwitch() {
        const pending = loadSnapshotSwitch();
        if (!pending) return;

        const currentUsername = await getRedditUsername();

        if (pending.phase === "restore-target") {
            if (currentUsername &&
                pending.username &&
                currentUsername.toLowerCase() === pending.username.toLowerCase()) {
                clearSnapshotSwitch();
                return;
            }

            if (pending.previousSnapshot && pending.previousUsername) {
                await restoreAccountSnapshot({
                    username: pending.previousUsername,
                    snapshot: pending.previousSnapshot
                });
            }
            clearSnapshotSwitch();
            if (pending.returnUrl) window.location.replace(pending.returnUrl);
            return;
        }

        if (currentUsername &&
            pending.username &&
            currentUsername.toLowerCase() === pending.username.toLowerCase()) {
            clearSnapshotSwitch();
            return;
        }
    }

    async function recoverInterruptedAddAccount() {
        const pending = loadAddAccountState();
        if (!pending) return;

        const currentUsername = await getRedditUsername();
        if (!currentUsername) return; // Still on the Reddit login UI.

        const previousUsername = pending.previousUsername || "";
        if (currentUsername.toLowerCase() === previousUsername.toLowerCase()) {
            return; // Login was not completed with a different account.
        }

        if (pending.phase === "login") {
            // The user deliberately logged into the new account. Save that
            // session, but do not restore the previous account. The new
            // account remains active until the user explicitly clicks Switch.
            const newSnapshot = await captureCurrentSession();
            updateAccountSnapshot(currentUsername, newSnapshot);
            clearAddAccountState();
            return;
        }
    }

    recoverInterruptedSnapshotSwitch();
    recoverInterruptedAddAccount();

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

        const accountAddBtn = makeWideBtn("Save Current Session", async () => {
            accountStatus.textContent = "Saving session...";
            try {
                const username = await saveCurrentAccountSession();
                accountStatus.textContent = "Session saved for u/" + username + ".";
                renderAccounts();
            } catch (error) {
                accountStatus.textContent = error && error.message ? error.message : "Session save failed.";
            }
        });
        panel.appendChild(accountAddBtn);

        const accountLoginBtn = makeWideBtn("Add Account", async () => {
            accountStatus.textContent = "Preparing login...";
            try {
                await beginAddAccount();
            } catch (error) {
                accountStatus.textContent = error && error.message ? error.message : "Could not start account login.";
            }
        });
        panel.appendChild(accountLoginBtn);

        const accountList = el("div", "display:flex; flex-direction:column; gap:2px; width:100%;");
        panel.appendChild(accountList);

        async function renderAccounts() {
            accountList.textContent = "";
            const accounts = loadAccounts();
            const currentUsername = await getRedditUsername();
            accountStatus.textContent = currentUsername
                ? "Current: u/" + currentUsername
                : "Not logged in.";

            if (!accounts.length) {
                accountList.appendChild(el("div", "font-size:10px; color:#777; text-align:center;", "No saved accounts."));
                return;
            }

            accounts.forEach((account, index) => {
                const row = el("div", "display:flex; align-items:center; gap:2px; width:100%;");
                const name = el(
                    "div",
                    "flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#ccc;",
                    account.username + (account.snapshot ? "" : " (no session)")
                );
                row.appendChild(name);

                const switchBtn = makeWideBtn("Switch", async () => {
                    accountStatus.textContent = "Switching...";
                    try {
                        await switchToAccount(account);
                    } catch (error) {
                        accountStatus.textContent = error && error.message ? error.message : "Account switch failed.";
                    }
                });
                switchBtn.style.width = "55px";
                switchBtn.style.flexShrink = "0";
                row.appendChild(switchBtn);

                const saveBtn = makeWideBtn("Save", async () => {
                    accountStatus.textContent = "Saving...";
                    try {
                        const username = await saveCurrentAccountSession();
                        accountStatus.textContent = username.toLowerCase() === account.username.toLowerCase()
                            ? "Session updated."
                            : "Currently logged in as u/" + username + ".";
                        renderAccounts();
                    } catch (error) {
                        accountStatus.textContent = error && error.message ? error.message : "Session save failed.";
                    }
                });
                saveBtn.style.width = "40px";
                saveBtn.style.flexShrink = "0";
                row.appendChild(saveBtn);

                const removeBtn = makeWideBtn("×", () => {
                    const current = loadAccounts();
                    current.splice(index, 1);
                    saveAccounts(current);
                    renderAccounts();
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
