# AutoTyper Pro — Build Instructions

This guide provides comprehensive instructions for building, testing, and packaging the **AutoTyper Pro** web simulator and cross-browser extensions (Chromium & Firefox).

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Build Commands](#build-commands)
4. [Build Artifacts & Output Structure](#build-artifacts--output-structure)
5. [Loading Unpacked Extensions](#loading-unpacked-extensions)
   - [Chromium (Chrome, Brave, Edge, Opera)](#chromium-chrome-brave-edge-opera)
   - [Mozilla Firefox](#mozilla-firefox)
6. [Client-Side In-Browser Packaging](#client-side-in-browser-packaging)
7. [Validation & Verification Harness](#validation--verification-harness)
8. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## ⚙️ Prerequisites

Ensure your system meets the following software requirements:

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Package Manager**: `npm` (v9+) or `bun` (v1.0+)
- **Browsers for Testing**:
  - Google Chrome, Brave, Microsoft Edge, or Opera (for Chromium Manifest V3)
  - Mozilla Firefox v109+ (for Gecko Manifest V3)

Check your environment:
```bash
node -v
npm -v
```

---

## 📦 Project Setup

Clone the repository and install project dependencies:

```bash
git clone <repository-url>
cd auto_typer

# Install dependencies
npm install
```

> **Note on Dependencies:** The project devDependencies specify `"esbuild": "^0.28.0"` to ensure compatible peer dependency resolution with `vite@8` and `tsx`. Standard `npm install` runs cleanly without `--legacy-peer-deps`.

---

## 🛠️ Build Commands

The following scripts are defined in `package.json`:

| Command | Action | Output Directory |
| :--- | :--- | :--- |
| `npm run dev` | Starts the local Vite development server with HMR | `http://localhost:3000` |
| `npm run build` | Full production build: compiles web app + extensions | `./dist` & `./build` |
| `npm run build:extension` | Compiles only the extension packages | `./build` |
| `npm run lint` | Strict TypeScript compilation check (`tsc --noEmit`) | Terminal output |
| `npm run preview` | Previews the compiled production web build locally | `http://localhost:4173` |
| `npm run clean` | Cleans build output directories | Deletes `./dist` & `./build` |

### 1. Full Production Build
Compiles the web simulator application with Vite and automatically triggers the extension generator script:
```bash
npm run build
```

### 2. Extension Compilation Only
If you only need to regenerate the unpacked extension folders:
```bash
npm run build:extension
```

### 3. Type Checking
Runs strict TypeScript validation across all codebase sources:
```bash
npm run lint
```

---

## 📁 Build Artifacts & Output Structure

Running `npm run build` or `npm run build:extension` produces the following directory tree:

```
auto_typer/
├── dist/                               # Production Web Simulator
│   ├── index.html
│   └── assets/                         # Bundled JS & CSS
└── build/                              # Extension Packages
    ├── README.md                       # Build summary documentation
    ├── chromium/                       # Chrome / Edge / Brave / Opera target
    │   ├── manifest.json               # Manifest V3 (Service Worker, Offscreen)
    │   ├── background.js               # Background service worker
    │   ├── content.js                  # In-page typist & shortcut engine
    │   ├── content.css                 # Floating HUD & palette styles
    │   ├── popup.html & popup.js       # Toolbar action popup
    │   ├── options.html & options.js   # Settings & snippet manager
    │   ├── offscreen.html & offscreen.js # Clipboard reading bridge
    │   ├── README.md                   # Extension loading instructions
    │   └── icons/
    │       ├── icon16.png              # 16x16 PNG toolbar icon
    │       ├── icon32.png              # 32x32 PNG icon
    │       ├── icon48.png              # 48x48 PNG store icon
    │       ├── icon128.png             # 128x128 PNG high-res icon
    │       └── icon.svg                # Scalable vector icon
    ├── firefox/                        # Mozilla Firefox target
    │   ├── manifest.json               # Manifest V3 (Gecko Addon ID, Background script)
    │   ├── background.js               # Background script
    │   ├── content.js                  # In-page typist & shortcut engine
    │   ├── content.css                 # Floating HUD & palette styles
    │   ├── popup.html & popup.js       # Toolbar action popup
    │   ├── options.html & options.js   # Settings & snippet manager
    │   ├── README.md                   # Firefox loading instructions
    │   └── icons/                      # PNG & SVG icons
    └── extension/                      # Universal default Chromium package
```

### Manifest Differences Between Targets

- **Chromium (`build/chromium/manifest.json`)**:
  - Uses `"background.service_worker": "background.js"`
  - Declares `"permissions": ["storage", "activeTab", "scripting", "contextMenus", "clipboardRead", "offscreen"]`
  - References `offscreen.html` to reliably read the system clipboard from background contexts.
- **Firefox (`build/firefox/manifest.json`)**:
  - Uses `"background.scripts": ["background.js"]`
  - Includes `"browser_specific_settings": { "gecko": { "id": "autotyper-pro@example.com" } }`
  - Omits `offscreen` permission since Firefox background pages possess DOM access.

---

## 🚀 Loading Unpacked Extensions

### Chromium (Chrome, Brave, Edge, Opera)

1. Run `npm run build:extension`.
2. Open your Chromium-based browser and navigate to:
   - **Chrome / Brave**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Opera**: `opera://extensions`
3. Toggle **Developer mode** to **ON** (top right corner).
4. Click **"Load unpacked"** in the top navigation bar.
5. Select the **`build/chromium`** directory.
6. The extension is now loaded and available in your browser toolbar!

### Mozilla Firefox

1. Run `npm run build:extension`.
2. Open Firefox and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```
3. Locate the **"Temporary Extensions"** section.
4. Click **"Load Temporary Add-on..."**.
5. Browse into the **`build/firefox`** directory and select **`manifest.json`**.
6. Click **Open**. AutoTyper Pro is now active in Firefox.

---

## 💾 Client-Side In-Browser Packaging

In addition to command-line builds, AutoTyper Pro allows users to export customized extension archives directly from the web interface:

1. Launch the web app via `npm run dev` and navigate to the **"Extension Exporter"** tab.
2. Select your target browser (**Chromium** or **Firefox**).
3. Click **"Download Extension (.zip)"**.
4. The client bundles your active snippets, speed settings, custom keybindings, and binary PNG icons on the fly using `JSZip` and downloads `autotyper-pro-chromium.zip` or `autotyper-pro-firefox.zip`.

---

## 🧪 Validation & Verification Harness

Before releasing or committing changes, run the validation pipeline:

### 1. TypeScript Strict Check
```bash
npm run lint
```
Must pass with 0 errors (`noUnusedLocals` and `noUnusedParameters` are enabled).

### 2. Full Build
```bash
npm run build
```
Confirms Vite client packaging and manifest asset validation.

### 3. Syntax Verification on Generated Extension Scripts
```bash
for f in $(find build -name "*.js"); do
  node --check "$f" || echo "FAIL: $f"
done
```
Confirms that all string-templated JavaScript in `src/utils/extensionGenerator.ts` generates syntactically valid code.

### 4. Manifest Asset Integrity Check
`scripts/build-extension.ts` automatically asserts:
- Every file referenced in `manifest.json` exists in the output directory.
- Every PNG icon matches the authentic 8-byte PNG header signature (`0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`).

---

## ❓ Troubleshooting & FAQs

### Q: `npm install` fails with `ERESOLVE could not resolve dependency`
**Fix**: Ensure your `package.json` contains `"esbuild": "^0.28.0"`. If a stale `node_modules` exists, run:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: Chrome reports "Could not load icon" when loading unpacked
**Fix**: Re-run `npm run build:extension`. The build script automatically emits 16, 32, 48, and 128 px PNG files decoded from base64 assets in `src/data/iconAssets.ts`.

### Q: Changes made to `src/utils/extensionGenerator.ts` are not reflected in `build/`
**Fix**: Re-run `npm run build:extension` after modifying generator templates. The `./build` directory is generated from source code templates.
