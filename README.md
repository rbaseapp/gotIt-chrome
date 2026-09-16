# GotIt Chrome Extension

Production-oriented Manifest V3 client for capturing a word or phrase together with its full sentence, page title, page URL and capture time. Translation/enrichment and persistence are performed by `gotit-backend`; provider API keys never enter the extension.

## Included V1 flows

- Email/password registration and login through rbase Core.
- Google sign-in through `chrome.identity`, exchanged for the same Core user/session used by the web product.
- Rotating Core refresh session with access tokens kept in `chrome.storage.session`.
- Right-click **Save to GotIt** capture using `activeTab` and temporary script injection.
- Manual popup capture and active-page selection capture.
- Optional instant double-click translation with separate quick-save and review actions, plus a floating action beside selected text, enabled only after an explicit optional host-permission grant.
- Sentence, title, URL, language hint and timestamp extraction without sending page HTML.
- Server preview using `auto`, `dictionary` or `ai`; no direct provider requests.
- Source and translation shown prominently as read-only by default with explicit editing, automatic item-type/part-of-speech detection, provider candidates and pronunciation playback.
- Existing-sense merge or explicit creation of a new sense.
- Idempotent save with a stable UUID across safe network/5xx retries.
- RTL/LTR-safe fields, keyboard focus, accessible labels and reduced-motion support.

## Security boundary

Only the service worker performs Core/GotIt requests. `chrome.storage.local` and `chrome.storage.session` are restricted to `TRUSTED_CONTEXTS`, so injected/content code cannot read sessions. The content script receives only a boolean feature flag and sends bounded capture context. There is no remote code, `eval`, broad persistent content script or provider endpoint/key in the package.

`X-Application-Key: gotit`, API base URLs and the Google OAuth client ID are public routing identifiers—not secrets. Anthropic/Google provider keys and the enrichment signing key belong only in the GotIt backend environment.

## Build and verify

Requires Node.js 24+.

```powershell
npm install
npm run verify
npm run package
```

The unpacked extension is generated in `dist/`. The versioned Web Store ZIP is generated in `artifacts/`.

For local backend development:

```powershell
npm run build:dev
```

Public build settings can be overridden with `CORE_API_BASE`, `GOTIT_API_BASE` and `GOOGLE_OAUTH_CLIENT_ID`. Do not pass provider secrets to this build.

## Chrome Web Store release prerequisites

1. Upload a draft to obtain/confirm the permanent extension ID.
2. Configure that ID in Google Cloud as a Chrome Extension OAuth client and provide the public client ID during the final build.
3. Register the same OAuth client ID in the production Core database for application `gotit` with client type `chrome_extension`, then verify `/auth/google/access-token`. CORS configuration does not perform this registration. Using the Core administration script with production database credentials:

   ```powershell
   node dist/scripts/configure-google.js --key gotit --client-id <client-id>.apps.googleusercontent.com --client-type chrome_extension
   ```
4. Deploy the current 41-route GotIt backend release and configure valid provider credentials/models and `ENRICHMENT_SIGNING_SECRET` on the server.
5. If the deployed HTTP policy requires it, allow the exact `chrome-extension://<extension-id>` origin in GotIt/Core configuration.
6. Host the text from `PRIVACY.md` at a public HTTPS URL and enter it in the Store listing.
7. Run authenticated production acceptance for email, Google, preview, new item, merge, new sense, refresh rotation and logout.

The default production endpoints are the endpoints already used by the prototype. Verify them against the actual Render services before publishing.

### Translation provider configuration

Google OAuth authenticates users only; it does not authorize Cloud Translation. For automatic `auto`/`dictionary` previews, configure these variables only on the GotIt backend service in Render:

```text
GOOGLE_TRANSLATION_API=cloud_basic_v2
GOOGLE_TRANSLATE_API_KEY=<server-side Google Cloud Translation API key>
ENRICHMENT_SIGNING_SECRET=<existing random secret of at least 32 bytes>
```

For the explicit AI method, configure `ANTHROPIC_API_KEY`, `AI_TRANSLATION_MODEL` and the same signing secret. Never place either provider key in this repository, the extension build or Chrome storage.
