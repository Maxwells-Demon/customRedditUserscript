# Reddit Account Switcher — Session Snapshot Architecture Guide

## Status

Implemented in `customRedditUserscript.js` v2.34.

This guide replaces the previous Reddit logout/login account-switching design.

## Problem

The previous implementation tried to automate Reddit's browser authentication flow:

1. Log out.
2. Navigate to Reddit login.
3. Wait for authentication.
4. Detect the new session.
5. Return to the original page.

This is fragile because Reddit controls the authentication UI, redirects, CAPTCHA/2FA, authentication hosts, and browser session cookies.

The new implementation does not automate Reddit login when switching between already-saved accounts.

## Research findings

The session-snapshot approach is used by multiple account-switching projects:

- AnMe: saves/restores Cookies, LocalStorage, and SessionStorage and provides both userscript and browser-extension implementations.
  https://github.com/Zhu-junwei/AnMe
- Switchboard: snapshots authenticated browser state, including cookies, Local Storage, Session Storage, IndexedDB, and Cache Storage. It explicitly avoids using a site's own logout operation for saved sessions.
  https://github.com/DYung26/switchboard
- GitHub Account Switcher: stores account cookies and restores them when switching.
  https://github.com/yuezk/github-account-switcher
- Session Switcher: stores browser session cookies locally and restores them on demand.
  https://github.com/fanesz/session-switcher

The common architecture is:

```
current account
    |
    v
capture browser session
    |
    +-- cookies
    +-- localStorage
    +-- sessionStorage
    |
    v
named account snapshot
    |
    v
switch
    |
    +-- clear current session
    +-- restore selected snapshot
    +-- verify username
    +-- reload
```

## Why cookies are the primary mechanism

Reddit's authenticated browser session is represented by browser state, and critical authentication cookies can be HttpOnly. A page script cannot reliably read or replace those cookies through `document.cookie`.

Tampermonkey exposes `GM.cookie` for cookie access. Its documentation lists cookie attributes including domain, path, expiration, Secure, HttpOnly, SameSite, session state, and partition information.

Tampermonkey documentation:

https://www.tampermonkey.net/documentation.php?q=GM_cookie

Important: Tampermonkey currently documents HttpOnly cookie support as dependent on its cookie-access configuration/version. The script therefore reports an explicit error when usable cookie access is unavailable.

## Userscript permissions

The userscript now declares:

```js
// @grant        GM.cookie
```

For Tampermonkey, cookie access must be enabled.

Recommended Tampermonkey configuration:

1. Open Tampermonkey Dashboard.
2. Open Settings.
3. Set Config mode to Advanced.
4. In Security, enable **Allow scripts to access cookies**.
5. Ensure HttpOnly cookie access is permitted by the installed Tampermonkey version.
6. Reload Reddit.

AnMe documents the same Tampermonkey cookie-access requirement for its userscript implementation:

https://github.com/Zhu-junwei/AnMe

## Account data model

Saved accounts now use:

```js
{
    username: "example",
    snapshot: {
        schemaVersion: 1,
        capturedAt: 0,
        origin: "https://www.reddit.com",
        cookies: [],
        localStorage: {},
        sessionStorage: {}
    }
}
```

The userscript's own `customRedditUserscript.*` storage keys are excluded from snapshots.

This prevents restoring an account snapshot from overwriting the account manager itself.

## Session provider

The implementation is intentionally separated into operations:

```text
hasCookieApi()
listRedditCookies()
captureCurrentSession()
clearRedditCookies()
restoreRedditCookies()
restoreAccountSnapshot()
verifyCurrentAccount()
```

The UI does not need to know how Reddit authentication works.

## Save flow

**Save Current Session**

1. Call `/api/me.json?raw_json=1`.
2. Determine the authenticated username.
3. Read Reddit cookies through `GM.cookie`.
4. Capture non-script Local Storage.
5. Capture non-script Session Storage.
6. Store the complete snapshot under that username.

A later Save operation replaces the stored snapshot, allowing refreshed sessions to be saved.

## Switch flow

**Switch**

1. Determine the currently authenticated username.
2. Capture the current session.
3. Refresh the current account's saved snapshot.
4. Record a temporary recovery snapshot.
5. Clear Reddit cookies.
6. Restore the target account's Local Storage and Session Storage.
7. Restore the target account's cookies.
8. Verify `/api/me.json` reports the target username.
9. If verification succeeds, reload the page.
10. If verification fails, restore the previous session and report failure.

The site logout endpoint is deliberately not called.

This is important because a site's logout operation can invalidate a server-side session that was supposed to remain reusable. Switchboard documents the same design choice.

## Add Account flow

Adding a second account must not start Reddit's login UI while the first account is still authenticated. The script therefore uses a temporary browser-session handoff:

1. Click **Add Account**.
2. Capture and save the currently authenticated account as a recovery snapshot.
3. Clear Reddit cookies and non-script Reddit storage.
4. Navigate to Reddit's normal login UI.
5. Complete login manually, including CAPTCHA/2FA if required.
6. After Reddit reports a different authenticated username, capture that new session automatically.
7. Save the new account snapshot.
8. Restore the original account snapshot.
9. Return to the page where **Add Account** was started.

The pending operation is stored separately from Reddit's storage and survives the login navigation. The script verifies the restored original session after a full page navigation.

Passwords, CAPTCHA responses, and 2FA codes are never stored by the script.

## Existing accounts

Accounts created by older versions contain only usernames.

They remain visible, but they have no session snapshot.

For each such account:

1. Log into that Reddit account normally.
2. Click **Save Current Session**.
3. The account receives a snapshot.
4. It can then be switched without another login.

Legacy plaintext password fields are not used by the new implementation.

## Storage scope

Cookies:

- `.reddit.com` cookie domain
- domain/path/name identity
- Secure
- HttpOnly
- expiration
- SameSite where exposed
- partition information where exposed

Local Storage:

- current Reddit origin
- script-owned keys excluded

Session Storage:

- current Reddit origin
- script-owned keys excluded

The primary authentication state is the cookie snapshot. Storage is included because modern sites can keep auxiliary authentication/application state outside cookies.

## Security model

Session snapshots are credentials.

A saved snapshot can provide access to the associated Reddit account until Reddit invalidates the session.

Therefore:

- Store snapshots only on trusted devices.
- Do not export or share the account storage.
- Do not put snapshots into Git.
- Do not log cookie values.
- Do not display cookie values in the UI.
- Do not send snapshots to a remote server.
- Treat Local Storage containing snapshots as sensitive.

The repository does not intentionally upload account snapshots anywhere.

## Known limitation: session invalidation

A saved session is not guaranteed to remain valid forever.

It can stop working if Reddit:

- expires the session;
- invalidates sessions;
- changes authentication state;
- requires a fresh authentication;
- invalidates sessions after security/account changes.

When that happens, log into the affected account normally and use **Save Current Session** again.

## Known limitation: browser/userscript implementation

The userscript depends on the userscript manager's cookie API.

If `GM.cookie` cannot access Reddit's HttpOnly authentication cookies, reliable account switching is impossible from ordinary page JavaScript alone.

The next architectural escalation would be a browser extension using the browser's cookies API.

A browser extension can explicitly request:

- `cookies` permission
- Reddit host permissions

and operate the cookie store from an extension context.

Reference:

https://developer.chrome.com/docs/extensions/reference/api/cookies

## Recovery design

Before switching, the current authenticated session is captured.

If target verification fails, the previous snapshot is restored.

This is preferable to leaving the browser logged out.

## Explicit non-goals

The account switcher does not:

- store Reddit passwords;
- automate CAPTCHA;
- bypass 2FA;
- use Reddit OAuth to replace browser authentication;
- call Reddit's logout endpoint during normal switching;
- scrape login forms;
- modify authentication responses.

## Migration from the previous implementation

Versions before 2.29 used a pending-login state machine.

That mechanism has been removed.

The new state is entirely local to saved snapshots.

Existing username-only accounts require one manual login followed by **Save Current Session**.

## Future extension point

If the userscript provider proves insufficient, the account UI can remain unchanged while replacing the session provider with an extension-backed provider:

```text
Account UI
    |
    v
SessionProvider
    |
    +-- Userscript GM.cookie provider
    |
    +-- Browser extension cookies provider
```

The UI and account model should not be coupled to either browser API.

## References

- AnMe — https://github.com/Zhu-junwei/AnMe
- Switchboard — https://github.com/DYung26/switchboard
- GitHub Account Switcher — https://github.com/yuezk/github-account-switcher
- Session Switcher — https://github.com/fanesz/session-switcher
- Tampermonkey GM.cookie — https://www.tampermonkey.net/documentation.php?q=GM_cookie
- Chrome cookies API — https://developer.chrome.com/docs/extensions/reference/api/cookies
