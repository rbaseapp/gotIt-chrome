# GotIt Chrome Extension

Production-oriented Manifest V3 client for capturing a word or phrase together with its full sentence, page title, page URL and capture time. Translation/enrichment and persistence are performed by `gotit-backend`; provider API keys never enter the extension.

## Included V1 flows

- Email/password registration and login through rbase Core.
- Google sign-in through `chrome.identity`, exchanged for the same Core user/session used by the web product.
- Rotating Core refresh session with access tokens kept in `chrome.storage.session`.
- Right-click **Save to GotIt** capture using `activeTab` and temporary script injection.
- Manual popup capture and active-page selection capture.
- Instant double-click translation with separate quick-save and review actions, plus a floating action beside selected text; each behavior is enabled by default and can be switched independently in settings.
- Configurable small, medium or large popup sizing for both the toolbar popup and inline translation, with optional close-on-outside-click behavior.
- Sentence, title, URL, language hint and timestamp extraction without sending page HTML.
- Server preview using `auto`, `dictionary` or `ai`; no direct provider requests.
- Source and translation shown prominently as read-only by default with explicit editing, inline item-type/part-of-speech details, a concise AI explanation, provider candidates and pronunciation playback.
- A compact AI action beside the translation replaces the full translation-method picker; languages stay available in a collapsed settings section.
- Existing-sense merge or explicit creation of a new sense.
- Idempotent save with a stable UUID across safe network/5xx retries.
- RTL/LTR-safe fields, keyboard focus, accessible labels and reduced-motion support.

## Security boundary

Only the service worker performs Core/GotIt requests. `chrome.storage.local` and `chrome.storage.session` are restricted to `TRUSTED_CONTEXTS`, so injected/content code cannot read sessions. The content script receives only a boolean feature flag and sends bounded capture context. There is no remote code, `eval`, broad persistent content script or provider endpoint/key in the package.

`X-Application-Key: gotit`, API base URLs and the Google OAuth client ID are public routing identifiers—not secrets. OpenAI/Google provider keys and the enrichment signing key belong only in the GotIt backend environment.

## Build and verify

Requires Node.js 24+.

```powershell
npm install
npm run verify
npm run package
```

The unpacked extension is generated in `dist/`. It always keeps the committed public key so rebuilding cannot change its extension ID, authentication storage or allowlisted CORS origin. Never ZIP or upload `dist/` to the Chrome Web Store. The versioned `artifacts/gotit-chrome-WEBSTORE-v<version>.zip` is generated in isolated staging and omits that key. Packaging checks the manifest inside the final ZIP before reporting success.

Unpacked builds use the committed public key in `scripts/extension-identity.mjs`, so their development extension ID is stable across modes, computers and directories. Web Store ZIPs omit the manifest `key` field because the store owns their production identity:

```text
coeeepgmiclcodbjgkimefabjedbkjpp
```

For local backend development:

```powershell
npm run build:dev
```

Public build settings can be overridden with `CORE_API_BASE`, `GOTIT_API_BASE` and `GOOGLE_OAUTH_CLIENT_ID`. Do not pass provider secrets to this build.

## Chrome Web Store release prerequisites

1. Run `npm run package`. This always rebuilds production, verifies that `manifest.key` is absent from the final archive, and creates `artifacts/gotit-chrome-WEBSTORE-v<version>.zip`. Upload only that ZIP to the existing Web Store item; never upload `dist/` or a manually created ZIP of it.
2. For a first release only, upload the ZIP as a draft to obtain the permanent Chrome Web Store item ID; publishing is not required. For updates, upload to that existing item. The Web Store owns the production extension identity, so do not add its public key to the uploaded manifest.
3. Configure that permanent item ID in Google Cloud as a Chrome Extension OAuth client and provide the public client ID through `GOOGLE_OAUTH_CLIENT_ID` during the final build.
4. Register the same OAuth client ID in the production Core database for application `gotit` with client type `chrome_extension`, then verify `/auth/google/access-token`. CORS configuration does not perform this registration. Using the Core administration script with production database credentials:

   ```powershell
   node dist/scripts/configure-google.js --key gotit --client-id <client-id>.apps.googleusercontent.com --client-type chrome_extension
   ```
5. Deploy the current 41-route GotIt backend release and configure valid provider credentials/models and `ENRICHMENT_SIGNING_SECRET` on the server.
6. If the deployed HTTP policy requires it, allow the exact `chrome-extension://<extension-id>` origin in GotIt/Core configuration.
7. Host the text from `PRIVACY.md` at a public HTTPS URL and enter it in the Store listing.
8. Run authenticated production acceptance for email, Google, preview, new item, merge, new sense, refresh rotation and logout.

The default production endpoints are the endpoints already used by the prototype. Verify them against the actual Render services before publishing.

### Email verification and recovery (1.4.5)

Register opens `https://gotit.rbaseapp.com/?auth=register`; Forgot password opens
`https://gotit.rbaseapp.com/?auth=reset`. Complete the emailed code and password
confirmation on the Web, then sign into the extension. Registration no longer creates
an extension session directly. Legacy internal registration messages fail before any
network call, so a Core 202 challenge cannot be mistaken for authentication.
Existing unverified accounts receive a localized instruction to verify on the Web.
No permissions were added. `npm run verify` passes 41 tests and package validation;
`npm run package` produces the keyless 1.4.5 Store archive. Store publication is a
separate release step; archive creation does not prove Store availability.

### Translation provider configuration

Google OAuth authenticates users only; it does not authorize Cloud Translation. For automatic `auto`/`dictionary` previews, configure these variables only on the GotIt backend service in Render:

```text
GOOGLE_TRANSLATION_API=cloud_basic_v2
GOOGLE_TRANSLATE_API_KEY=<server-side Google Cloud Translation API key>
ENRICHMENT_SIGNING_SECRET=<existing random secret of at least 32 bytes>
```

For the explicit AI method, configure `OPENAI_API_KEY`, `OPENAI_TRANSLATION_MODEL` and the same signing secret. The backend also uses OpenAI with `AI_READING_MODEL=gpt-6-luna` for story generation. Never place any provider key in this repository, the extension build or Chrome storage.
