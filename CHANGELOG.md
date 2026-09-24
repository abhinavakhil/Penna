# Changelog

## 0.2.0

All packages move to 0.2.0 together. Publish `penna-core` first: on publish, `workspace:*` becomes an exact version, so each package pins the matching core.

### New

- **`@abhinavakhil/penna-angular`**: `<ngx-penna>` standalone component. Works with `ngModel`, `formControl` and `formControlName` (a disabled control makes the editor read-only), or `[(value)]`. Adds `providePenna()` for app-wide defaults and `PennaModule` for NgModule apps, plus `<ngx-penna-content>` for rendering saved JSON. Safe for server-side rendering.
- **Themes:** new `sepia` theme. On `auto`, the editor now follows a `data-theme` or `.dark` ancestor before the OS setting.
- **`dir` option** (`'ltr' | 'rtl' | 'auto'`). Spacing uses logical CSS properties, so lists, quotes and the drag handle mirror in RTL.
- **Opt-in extensions:**
  - `shortcuts()`: blocks you can insert from the slash menu (`/budget`, `/impact`…), with optional hotkeys. People can save the selection as their own shortcut. `fundraisingShortcuts` is a ready-made set.
  - `proofread()`: underlines spelling mistakes, wordy phrases and long sentences, with one-click fixes and a score. Decorations only, so saved content never changes on its own.
  - `mentions()`: `@` mentions as inline `mention` nodes.
  - `mergeFields()`: `{{first_name}}` fields as inline `merge_field` nodes. They serialise to `{{key}}` in text and Markdown. `setPreview()` shows real values.
  - `comments()`: `comment` marks that anchor thread ids. The threads themselves live in your app.
  - `versionHistory()`: idle autosave snapshots, named versions, a word diff against the current text, and restore.
  - `focusMode()`: dims everything except the current sentence or paragraph, keeps the current line near the middle (typewriter scrolling), and hides the toolbar while you type.
- **"Turn into" menu** on the selection bubble.
- **Hotkeys in the slash menu:** items can declare a `hotkey`, and the menu shows it. `Ctrl/⌘+Alt+T` now inserts a table.
- **Helpers:** `commands.insertStarter()` inserts a starter sentence and selects its first `___`. Also `diffWords()`, `diffHTML()`, `readability()` (Flesch–Kincaid grade and reading age) and `suggestPlugin()` for building your own trigger-character menus.
- **`penna-ai`:** rewrites show a word-level diff before you accept them.
- **Wrappers:** React, Vue and `<penna-editor>` accept `dir` and `sepia`, and `theme` can be set back to `auto` at runtime.

### Changed (check before upgrading)

- **New default look:** the accent moves from indigo to violet (`--pn-accent: #7a5af0`), new neutral colours, 12px radius, and 32px buttons (40px on touch screens). New tokens: `--pn-accent-ink`, `--pn-on-accent`, `--pn-surface-3`, `--pn-border-strong`, and `--pn-good`/`bad`/`info`/`warn` with `-soft` variants. Override the variables to keep the old look.
- **Default bubble:** the H1, H2, bullet list and quote buttons are replaced by a single **Turn into** menu. Comments and custom shortcuts add their own bubble buttons when enabled.
- **Auto dark mode:** it now reacts to `data-theme="dark"` or `.dark` on any ancestor. Set `theme: 'light'` explicitly if the page is dark but the editor should stay light.
- **Extension key handling:** extension plugins now run before Penna's keymaps, so their popups can handle Enter and the arrow keys. An extension that binds Enter or Tab now takes priority over the built-ins.
- **Clear formatting** no longer removes comment anchors.

### Fixed

- Clicking a button in the selection bubble with a real mouse did nothing, because the bubble re-rendered between mousedown and click.
- `repository.directory` in each package's `package.json` now points at the package folder.
