# Account Switcher Implementation Guide

## Goal

Replace the legacy headless Reddit username/password switcher with a browser-session account manager.

The userscript must not reproduce Reddit's private authentication protocol. Reddit owns authentication, including CAPTCHA, 2FA, email verification, and anti-abuse checks.

## Architecture

```
Account Manager
    |
    +-- saved account identity
    |
    +-- switch request
            |
            v
      Reddit logout
            |
            v
      Reddit login UI
            |
            v
      Browser-created session
            |
            v
      /api/me.json
            |
            v
      verify requested username
```

## Account data

Store account identity only:
- username
- optional display metadata
- no persistent password

## Switching flow

1. Record requested username, current page URL, and timestamp.
2. Determine current user with `/api/me.json?raw_json=1`.
3. If already the requested account, finish.
4. If another account is active, log out.
5. Navigate to Reddit's current login UI.
6. User completes authentication, including CAPTCHA/2FA when required.
7. Detect the pending switch on Reddit pages.
8. Verify the authenticated username with `/api/me.json?raw_json=1`.
9. If it matches, clear pending state and return to the original page.
10. If it does not match, show an error and keep the pending state available for retry.
11. Expire abandoned pending switches.

## State machine

- IDLE
- LOGGING_OUT
- LOGIN_REQUIRED
- AUTHENTICATING
- VERIFYING
- SWITCHED
- ERROR

## Security rules

- Do not store Reddit passwords in localStorage.
- Do not bypass CAPTCHA, 2FA, or verification.
- Do not treat an OAuth token as a browser login session.
- Do not declare success merely because a login page disappeared.
- Success requires username equality from `/api/me.json`.

## UI

Show:
- current authenticated account
- saved account identities
- Switch
- Remove
- Add Account / authenticate
- authentication state

Adding an account authenticates through Reddit's normal login UI and records the resulting username.

## Compatibility

Test old.reddit.com, www.reddit.com, Android/touch browsers, desktop browsers, CAPTCHA, 2FA, failed authentication, wrong-account authentication, already-authenticated targets, and abandoned switches.

## Implementation phases

### Phase 1
Replace password/API-login architecture with browser-session state and pending-switch storage.

### Phase 2
Implement logout-to-login navigation and return URL handling.

### Phase 3
Implement post-login identity verification.

### Phase 4
Replace account UI and remove password fields/storage.

### Phase 5
Test edge cases and clean legacy authentication code.

## Current decision

Use Reddit's visible authentication UI rather than `/api/login`. The legacy API login is not a reliable basis for changing the browser's current Reddit session.
