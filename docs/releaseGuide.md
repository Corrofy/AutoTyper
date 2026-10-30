# AutoTyper Pro — GitHub Release & Packaging Guide

This guide is tailored specifically for you to build, package, and publish official GitHub Releases so your friends and colleagues can download and use **AutoTyper Pro** instantly — with **zero compilation**, **no Node.js**, and **no terminal commands**.

---

## ⚡ The 2-Minute Quick Workflow

Whenever you are ready to ship a release:

```bash
# 1. Package pre-built ZIP archives
npm run package

# 2. Tag the release in git and push
git tag v1.2.1
git push origin v1.2.1
```

3. Open your GitHub repository in your browser:  
   👉 `https://github.com/<your-username>/auto_typer/releases/new`
4. Select the tag `v1.2.1`.
5. Drag and drop the two generated files from your `./release/` directory:
   - `autotyper-pro-chromium-v1.2.1.zip`
   - `autotyper-pro-firefox-v1.2.1.zip`
   - *(Optional)* `SHA256SUMS.txt`
6. Copy & paste the [Friend-Friendly Release Notes Template](#-ready-to-copy-github-release-notes) below.
7. Click **"Publish release"**. Done!

---

## 📦 What Files Are Built?

Running `npm run package` compiles clean, production-ready extension archives into `./release/`:

| Asset | Size | Target Browsers |
| :--- | :--- | :--- |
| **`autotyper-pro-chromium-v1.2.1.zip`** | ~45 KB | Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi |
| **`autotyper-pro-firefox-v1.2.1.zip`** | ~45 KB | Mozilla Firefox (Gecko MV3) |
| **`SHA256SUMS.txt`** | ~1 KB | Verification checksums |

These ZIPs are **ready-to-load** at the root of the archive (containing `manifest.json`, `background.js`, `content.js`, icons, etc.). Your friends will never need to install npm, build dependencies, or touch code.

---

## 📋 Ready-to-Copy GitHub Release Notes

Copy and paste the template below directly into your GitHub Release description:

```markdown
# AutoTyper Pro v1.2.1 🚀

AutoTyper Pro simulates natural, human-like keystroke typing into any web text box, form, or code editor. It defeats strict anti-paste restrictions (`onpaste="return false;"`) by streaming authentic keyboard events with realistic cadence and timing jitter.

---

## 📥 How to Install (No Technical Experience Required!)

### For Google Chrome, Brave, Microsoft Edge & Opera:
1. Download **`autotyper-pro-chromium-v1.2.1.zip`** from the **Assets** section below.
2. Unzip the downloaded file onto your computer (e.g. into your `Documents` or `Downloads` folder).
3. Open your browser and navigate to the Extensions page:
   - **Chrome / Brave**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Opera**: `opera://extensions`
4. Turn **ON** the switch labeled **"Developer mode"** (in the top-right corner).
5. Click the button labeled **"Load unpacked"** (top-left).
6. Select the unzipped folder.
7. 🎉 **That's it!** The AutoTyper keyboard icon will appear in your browser toolbar. Pin it for easy access!

---

### For Mozilla Firefox:
1. Download **`autotyper-pro-firefox-v1.2.1.zip`** from the **Assets** section below.
2. Open Firefox and enter this in the URL address bar:
   ```
   about:debugging#/runtime/this-firefox
   ```
3. Look for the **"Temporary Extensions"** section and click **"Load Temporary Add-on..."**.
4. Select the downloaded **`autotyper-pro-firefox-v1.2.1.zip`** file (or select `manifest.json` if you unzipped it).
5. 🎉 **Installed!** AutoTyper Pro is immediately active in Firefox.

---

## ⌨️ How to Use & Default Shortcuts

Click into any text field, online coding sandbox (OneCompiler, Monaco, CodeMirror), or form:

| Shortcut | What It Does |
| :--- | :--- |
| **`Alt + Shift + V`** | **Auto-Type Clipboard**: Types your copied text character-by-character with realistic speed and human cadence. |
| **`Alt + K`** | **Snippet Palette**: Pops up an in-page search box to pick and auto-type any saved template. |
| **`Alt + M`** | **Manual Mistake**: Injects an intentional human-like typo, hesitates, hits backspace, and corrects it! |
| **`Escape`** | **Emergency Stop**: Immediately cancels simulated typing at any moment. |
| **`:sig + Tab`** | **Instant Trigger**: Type `:sig`, `:meeting`, or any custom trigger in a field followed by `Tab` to expand it. |

---

## ⚙️ Customizing Your Speed and Snippets
- Click the **AutoTyper Pro** icon in your browser toolbar.
- Click **"Snippet Manager & Shortcuts"** at the bottom of the popup.
- Adjust your typing velocity (e.g. 75 WPM), enable mechanical keyboard sound clicks (Cherry MX Blue/Brown/Red), or add your own custom snippets with dynamic variables like `{{date}}`, `{{time}}`, or `{{name}}`.
```

---

## 🤖 Publishing via GitHub CLI (`gh`)

If you prefer publishing releases directly from your terminal using the official [GitHub CLI (`gh`)](https://cli.github.com/):

```bash
# 1. Package the zip archives
npm run package

# 2. Publish release with assets attached in one command:
gh release create v1.2.1 \
  release/autotyper-pro-chromium-v1.2.1.zip \
  release/autotyper-pro-firefox-v1.2.1.zip \
  release/SHA256SUMS.txt \
  --title "AutoTyper Pro v1.2.1" \
  --notes-file docs/releaseGuide.md
```

---

## 🔄 Releasing Future Updates (Version Bumping)

When you make new improvements or bug fixes in the future:

1. **Bump the version** in `package.json`:
   ```bash
   # For bug fixes: 1.2.1 -> 1.2.2
   npm version patch --no-git-tag-version

   # Or for new features: 1.2.1 -> 1.3.0
   npm version minor --no-git-tag-version
   ```

2. **Commit and package**:
   ```bash
   git add package.json
   git commit -m "chore: bump version to v1.2.2"
   npm run package
   ```

3. **Tag and push**:
   ```bash
   git tag v1.2.2
   git push origin main --tags
   ```

4. Create the new release on GitHub and upload the fresh ZIP files from `./release/`.

---

## 💡 Pro-Tips for Your Friends

1. **Updating the Extension**:
   - When you publish an update, friends simply download the new ZIP, unzip it over the same folder, and click the circular **"Reload"** icon on `chrome://extensions`.
2. **Pinned Toolbar Icon**:
   - Tell your friends to click the puzzle-piece icon in their browser toolbar and **pin** AutoTyper Pro so they can open the popup and trigger snippets with 1 click.
3. **No Web Store Account Required**:
   - Loading unpacked extensions requires **no Google/Mozilla developer fees**, no account registration, and no privacy reviews.
