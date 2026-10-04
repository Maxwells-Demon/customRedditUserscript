// ==UserScript==
// @name         CustomRedditUserscript
// @version      0.1
// @description
// @author       levin
// @match        https://*.reddit.com/*
// @include      https://*.reddit.com/*
// @include      https://reddit.com/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/Maxwells-Demon/customRedditUserscript/refs/heads/main/customRedditUserscript.js
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

    function applyFilters() {
        const now = Date.now();
        document.querySelectorAll("#siteTable .thing[data-type='link']").forEach(post => {
            let show = true;

            if (filters.minScore !== null) {
                const score = parseInt(post.dataset.score, 10);
                if (isNaN(score) || score < filters.minScore) show = false;
            }

            if (show && filters.maxAge !== null) {
                const ts = parseInt(post.dataset.timestamp, 10);
                const ageDays = (now - ts) / 86_400_000;
                if (isNaN(ts) || ageDays > filters.maxAge) show = false;
            }

            if (show && filters.title) {
                const titleEl = post.querySelector("a.title");
                const text = titleEl ? titleEl.textContent.toLowerCase() : "";
                if (!text.includes(filters.title.toLowerCase())) show = false;
            }

            if (show && filters.url) {
                const url = (post.dataset.url || "").toLowerCase();
                if (!url.includes(filters.url.toLowerCase())) show = false;
            }

            if (show && filters.flair) {
                const flairEl = post.querySelector(".linkflairlabel");
                const flairText = flairEl ? flairEl.textContent.toLowerCase() : "";
                if (!flairText.includes(filters.flair.toLowerCase())) show = false;
            }

            post.style.display = show ? "block" : "none";
        });
    }

    const observer = new MutationObserver(() => applyFilters());
    waitForElement("#siteTable", el => {
        observer.observe(el, { childList: true, subtree: true });
    });

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
        const b = el("div", `
            box-sizing:border-box; width:100%; padding:3px 0; text-align:center;
            background:#2a2a2a; border:1px solid #555; border-radius:3px;
            color:#ccc; cursor:pointer; font-family:monospace; font-size:11px;
            user-select:none;
        `, text);
        b.onclick = onclick;
        return b;
    }

    // btn that shows its step label, e.g. "10", "1k", "1h"
    function makeStepBtn(label) {
        return el("div", `
            box-sizing:border-box; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#aaa; cursor:pointer; font-family:monospace;
            font-size:9px; text-align:center; user-select:none; flex-shrink:0;
            width:20px; height:22px; line-height:22px;
        `, label);
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
            padding:8px;
        `);

        root.addEventListener("mouseenter", () => {
            panel.style.display = "flex";
            collapseBtn.textContent = "✕";
        });
        root.addEventListener("mouseleave", () => {
            panel.style.display = "none";
            collapseBtn.textContent = "☰";
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

        // ── Sidebar toggle ────────────────────────────────────────────────────
        let sidebarVisible = false;
        const setSidebarVisible = visible => {
            sidebarVisible = visible;
            sidebarCSS.innerHTML = sidebarVisible ? ".side{display:unset!important;}" : ".side{display:none!important;}";
            sideBtn.textContent = sidebarVisible ? "Hide Sidebar" : "Show Sidebar";
            sidebarBtn.textContent = sidebarVisible ? "◀" : "▶";
            sidebarBtn.title = sidebarVisible ? "Hide sidebar" : "Show sidebar";
        };

        const sidebarBtn = el("div", `
            box-sizing:border-box; width:22px; height:22px; line-height:20px;
            text-align:center; background:#2a2a2a; border:1px solid #555;
            border-radius:3px; color:#ccc; cursor:pointer; font-family:monospace;
            font-size:13px; user-select:none;
        `, "▶");
        sidebarBtn.title = "Show sidebar";
        sidebarBtn.onclick = () => setSidebarVisible(!sidebarVisible);

        panel.appendChild(makeHR());
        const sideBtn = makeWideBtn("Show Sidebar", () => setSidebarVisible(!sidebarVisible));

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
        root.appendChild(sidebarBtn);
        root.appendChild(collapseBtn);
    })();
})();
