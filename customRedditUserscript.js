// ==UserScript==
// @name         CustomRedditUserscript
// @version      1.7
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
            const accounts = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "[]");
            return Array.isArray(accounts) ? accounts
                .filter(a => a && typeof a.username === "string")
                .map(a => ({ username: a.username })) : [];
        } catch (_) {
            return [];
        }
    }

    function saveAccounts(accounts) {
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    }

    const LOGIN_HINT_KEY = "customRedditUserscript.loginHint";
    const LOGIN_PENDING_KEY = "customRedditUserscript.loginPending";

    async function loginToAccount(account) {
        sessionStorage.setItem(LOGIN_HINT_KEY, account.username);
        sessionStorage.setItem(LOGIN_PENDING_KEY, "1");

        // Reddit's login page reuses an existing session. Log out first so
        // the switch cannot simply return to the currently active account.
        window.location.assign("/logout");
    }

    function handleLoginHint() {
        const username = sessionStorage.getItem(LOGIN_HINT_KEY);
        const pending = sessionStorage.getItem(LOGIN_PENDING_KEY);
        if (!username || pending !== "1") return;

        const isLoginPage = /\/login(?:\/|$)/.test(window.location.pathname);

        if (!isLoginPage) {
            // /logout may redirect to the front page. Continue to the native
            // login page after the old Reddit session has been terminated.
            window.location.replace("/login/");
            return;
        }

        const input = document.querySelector(
            "#login-username, input[name='username'], input[autocomplete='username']"
        );

        if (!input) {
            setTimeout(handleLoginHint, 250);
            return;
        }

        if (!input.value) {
            input.value = username;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Reddit owns password, CAPTCHA and 2FA handling.
        sessionStorage.removeItem(LOGIN_HINT_KEY);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
    }

    handleLoginHint();

    // ── Main setup ────────────────────────────────────────────────────────────
    (function setup() {
        const css = "body{overflow-x:hidden;} #eu-cookie-policy{display:none;} #progressIndicator{flex-grow:1;} body.with-listing-chooser>.content,body.with-listing-chooser .footer-parent{margin-left:100px;} .listing-chooser{position:fixed!important;overflow:auto!important;top:0!important;} .with-listing-chooser .listing-chooser.initialized{width:100px;padding-right:0;} .listing-chooser ul.multis li{margin-bottom:1px;margin-top:0;margin-left:0;border:0 solid #ccc;border-radius:5px;} .listing-chooser ul.multis li a{padding:.2em 1px;padding-left:3px;} .listing-chooser ul.multis li:hover{margin-left:5px;} .listing-chooser li{border-radius:5px;} .listing-chooser .contents{margin-top:0!important;} .listing-chooser li.selected{margin-right:0;padding-right:0;} .promoted{display:none;} .link{margin-bottom:1px;background-color:rgb(0 0 0/25%)!important;width:99%;margin-left:5px;flex-grow:2;} .link .flat-list{padding:0;} .link .title{font-size:small;font-weight:normal;margin-bottom:0;} .noCtrlF{display:none;} .post-crosspost-button{display:none;} .report-button{display:none!important;} .post-sharing-button{display:none;} .give-gold{display:none;} .entry .buttons li+li{padding-left:0;} .entry .buttons li{padding-right:2px;line-height:1em;} .thumbnail{width:70px;margin-right:10px;margin-bottom:0;} .thumbnail img{width:100%!important;height:auto!important;} .rank{display:none;} .midcol-spacer{width:0!important;} .midcol{margin:0!important;} .grippy{display:none!important;} .NERPageMarker{flex-grow:1;width:100%;} .md{max-width:100%;} .usertext-body{width:50%;} .arrow{margin:1px 0 0 0;}";

        const styleEl = document.createElement("style");
        document.head.appendChild(styleEl);
        styleEl.innerHTML = css;

        const thumbCSS = document.createElement("style");
        document.head.appendChild(thumbCSS);

        const sidebarCSS = document.createElement("style");
        document.head.appendChild(sidebarCSS);
        sidebarCSS.innerHTML = ".side{display:none!important;}";


        // ── Root container fixed to bottom-right ──────────────────────────────
        const root = el("div", `
            position:fixed; bottom:12px; right:12px; z-index:99999;
            display:flex; flex-direction:column; align-items:flex-end; gap:2px;
        `);
        document.body.appendChild(root);

        // ── Collapse button ───────────────────────────────────────────────────
        const collapseBtn = el("div", `
            box-sizing:border-box; width:22px; height:22px; line-height:20px;
            text-align:center; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#ccc; font-family:monospace;
            font-size:13px; user-select:none;
        `, "☰");

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
            thumbCSS.innerHTML = `.thumbnail{width:${thumbnail_width}px!important;}`;
            thumbValLabel.textContent = thumbnail_width + "px";
        };
        thumbP.onclick = () => {
            thumbnail_width += 20;
            thumbCSS.innerHTML = `.thumbnail{width:${thumbnail_width}px!important;}`;
            thumbValLabel.textContent = thumbnail_width + "px";
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

        const accountUser = el("input", BASE_INPUT + "width:100%;");
        accountUser.type = "text";
        accountUser.autocomplete = "username";
        accountUser.placeholder = "username";
        accountUser.inputMode = "text";
        panel.appendChild(accountUser);

        panel.appendChild(el(
            "div",
            "font-size:10px; color:#777; text-align:center; line-height:13px;",
            "Switch opens Reddit login. Password, CAPTCHA and 2FA stay in Reddit."
        ));

        const accountAddBtn = makeWideBtn("Add Account", () => {
            const username = accountUser.value.trim();
            if (!username) {
                accountStatus.textContent = "Username required.";
                return;
            }

            const accounts = loadAccounts();
            const existing = accounts.findIndex(a =>
                a.username.toLowerCase() === username.toLowerCase()
            );

            if (existing < 0) accounts.push({ username });
            saveAccounts(accounts);
            accountUser.value = "";
            accountStatus.textContent = "Account saved.";
            renderAccounts();
        });
        panel.appendChild(accountAddBtn);

        const accountList = el("div", "display:flex; flex-direction:column; gap:2px; width:100%;");
        panel.appendChild(accountList);

        function renderAccounts() {
            accountList.textContent = "";
            const accounts = loadAccounts();

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
    })();
})();
