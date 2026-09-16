# Chrome Web Store listing draft

## Name

GotIt — Learn words in context

## Short description

Save words and phrases with their sentence, source page and translation, then learn them in GotIt.

## Detailed description

GotIt turns words you meet online into useful learning material. Select a word or phrase, open the right-click menu and choose **Save to GotIt**. Before saving, you can review the detected languages, choose automatic, dictionary or AI translation, edit the meaning and decide whether the context belongs to an existing meaning or a new one.

GotIt saves the selected expression together with its sentence, page title and URL so the word remains connected to where you found it. It supports multilingual and mixed RTL/LTR content, manual entry and an optional quick-action button beside selections.

Translation providers are called by the GotIt server. No provider API key is included in the extension.

## Single-purpose statement

The extension captures user-selected words and phrases with their page context and saves them to the user's GotIt language-learning library.

## Permission justifications

- `storage`: stores the Core login session, local UI settings and one pending user-triggered capture.
- `contextMenus`: adds the user-triggered “Save to GotIt” selection action.
- `activeTab`: reads the current selection and its sentence only after the user invokes the extension.
- `scripting`: temporarily injects the context extractor after a user action.
- `identity`: obtains a Google OAuth token when the user chooses Google sign-in.
- Core/GotIt host permissions: authenticate and call the product API.
- Optional HTTP/HTTPS host permissions: enable the floating selection action only when the user opts in; they are removed when the feature is disabled.

## Assets still required from publisher

- 1280×800 or 640×400 screenshots.
- Optional 440×280 promotional tile.
- Public support email/site and hosted privacy-policy URL.
- Final brand review and localized listing copy.
