# PuPu Web Browser — 05 · Cookie Import (B + D1)

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 5.1 · Trigger Points and UX

### Three entry points

1. **First launch of browser mode** (per device, not per chat)
   - The first time a user clicks globe in any chat, a one-time banner appears at the top of the browser workspace:
     > 🍪 Import login state from Google Chrome? Sites already signed in there will also be signed in here. You can do this later in Settings.
     > [Import] [Not now] [Don't ask again]
2. **Settings → Browser → "Import cookies from Chrome"** (always available; can re-import)
3. **Fallback on failed auth** *(future, not in Phase 3)*: after an agent visit to a gated page fails, offer import inline in the chat.

### Import UX flow

- Click Import → detect whether Chrome is running
  - If running: dialog "Please quit Google Chrome so PuPu can read its cookies safely", with a Retry button. User quits Chrome themselves.
  - If not running: proceed immediately
- macOS first-run triggers **Keychain authorization** (system modal, requires password or Touch ID) — this is outside PuPu's control
- During import: progress bar (by cookie count). A typical Chrome profile has ~5000 cookies; usually under 3 s
- On success: toast "Imported N cookies from M sites."
- On failure: toast + "View details" link; **never blocks usage**

## 5.2 · Implementation Sketch — `electron/browser/chrome_cookie_importer.js`

```js
// Responsibility: read Chrome profile cookies, decrypt, write to Electron session.
// Dependency: chrome-cookies-secure (Node, main process only).

async function importChromeCookies(session, { onProgress } = {}) {
  if (await isChromeRunning()) {
    throw new ChromeRunningError();
  }

  const profilePath = getDefaultChromeProfilePath();  // cross-platform
  if (!fs.existsSync(profilePath)) {
    throw new ChromeProfileNotFoundError();
  }

  const cookies = await readAndDecryptChromeCookies(profilePath);
  // cookies: [{domain, name, value, path, expires, secure, httpOnly, sameSite}]

  let imported = 0, failed = 0;
  for (const c of cookies) {
    try {
      await session.cookies.set({
        url: cookieToUrl(c),
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: mapSameSite(c.sameSite),
        expirationDate: c.expires,
      });
      imported++;
    } catch (e) {
      failed++;
    }
    if (imported % 100 === 0) onProgress?.({ imported, total: cookies.length });
  }

  return { imported, failed, total: cookies.length };
}
```

### Key points

- **Session scope:** `session.fromPartition("persist:pupu-browser")`. All per-chat webviews use this same partition — they share cookies natively. This corresponds to the "B global jar" decision.
- `session.cookies.set` is a first-class Electron API — no SQLite rolling.
- `sameSite` mapping: Chrome stores `SameSiteNoRestriction | SameSiteLax | SameSiteStrict`; Electron uses `no_restriction | lax | strict`.
- **Silently ignore** expired cookies, empty domains, malformed values. Count them as `failed` but don't abort.

## 5.3 · Cross-Platform and Failure Modes

| Platform | Chrome profile path | Encryption | Status |
|---|---|---|---|
| macOS | `~/Library/Application Support/Google/Chrome/Default/Cookies` | AES-128-CBC; key in Keychain "Chrome Safe Storage" | **Day-1 target** |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cookies` | DPAPI; key in `Local State` JSON | **Day-1 target (phased)** |
| Linux | `~/.config/google-chrome/Default/Cookies` | AES-128-CBC; key from libsecret (GNOME Keyring / KDE Wallet) or hardcoded `peanuts` (legacy) | **Day-1 target (phased)** |

All three platforms will ship, but in phased waves (see [Phasing](./2026-04-13-pupu-web-browser-08-phasing.md) — Phase 3 is macOS, Phase 3.5 is Win/Linux).

### Failure modes (most common first)

| Failure | Handling |
|---|---|
| Chrome is running | Prompt user to quit Chrome; offer Retry |
| Keychain access denied | Toast: "Keychain access denied. You can grant it later in System Settings." |
| Chrome not installed / profile missing | Toast: "No Chrome profile found." Hide the Import button. |
| `chrome-cookies-secure` decrypt failure (Chrome version mismatch) | Toast + detailed console log; recommend manual login |
| Partial cookie write failures | Don't error out; tally `failed` count; final toast: "Imported 4823 (12 skipped)" |

## 5.4 · Explicitly Out of Scope (YAGNI)

- ❌ Import from Safari / Firefox / Edge — Chrome only (covers ~95% of use cases)
- ❌ Periodic / incremental sync — one-shot only; no ongoing consistency guarantee
- ❌ Password import — too sensitive, and PuPu doesn't store passwords
- ❌ Bookmark import — no bookmark system planned
- ❌ Extensions / history import

## 5.5 · Privacy & Compliance Notes

- Import is a **local process** operation. Cookies never leave the user's device.
- Chrome's cookie file is read only; not modified.
- PuPu's session cookie jar lives under the Electron `userData` directory, alongside the user's other data. Clearing `userData` clears it as well.
- **Settings must include a "Clear imported cookies" button** so users can reverse the import.
- Import triggers **zero network requests** — purely a local file read operation.

## 5.6 · "Don't ask again" Granularity

**Per device.** The decision to import cookies is a device-level action (it involves Keychain and the user's OS-level Chrome profile). It is not chat-scoped.
