/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SNIPPETS, DEFAULT_SETTINGS } from '../src/data/defaultSnippets.ts';
import { generateExtensionFiles } from '../src/utils/extensionGenerator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');

function buildExtension(target: 'chrome' | 'firefox', outputSubdir: string) {
  const targetDir = path.join(buildDir, outputSubdir);
  fs.mkdirSync(targetDir, { recursive: true });

  const files = generateExtensionFiles(DEFAULT_SNIPPETS, DEFAULT_SETTINGS, target);

  for (const file of files) {
    const fullPath = path.join(targetDir, file.path);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (file.encoding === 'base64') {
      fs.writeFileSync(fullPath, Buffer.from(file.content, 'base64'));
    } else {
      fs.writeFileSync(fullPath, file.content, 'utf8');
    }
  }

  validateManifest(targetDir);

  console.log(`[Build] Generated ${files.length} extension files in ${path.relative(rootDir, targetDir)}`);
}

/**
 * Fail the build when the manifest references a missing asset. This prevents
 * shipping a package that Chrome refuses to load.
 */
function validateManifest(targetDir: string) {
  const manifestPath = path.join(targetDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const referenced = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value === 'string' && value) referenced.add(value);
  };
  const addIconMap = (value: unknown) => {
    if (typeof value === 'string') {
      add(value);
    } else if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(add);
    }
  };

  add(manifest.background?.service_worker);
  add(manifest.background?.page);
  (manifest.background?.scripts || []).forEach(add);

  (manifest.content_scripts || []).forEach((entry: { js?: string[]; css?: string[] }) => {
    (entry.js || []).forEach(add);
    (entry.css || []).forEach(add);
  });

  add(manifest.action?.default_popup);
  addIconMap(manifest.action?.default_icon);
  addIconMap(manifest.icons);
  add(manifest.options_ui?.page);
  add(manifest.side_panel?.default_path);

  for (const relativePath of referenced) {
    const absolutePath = path.join(targetDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`[Build] manifest.json references missing file: ${relativePath} (${targetDir})`);
    }

    if (relativePath.endsWith('.png')) {
      const header = fs.readFileSync(absolutePath).subarray(0, 8);
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (!header.equals(pngSignature)) {
        throw new Error(`[Build] ${relativePath} is not a valid PNG file`);
      }
    }
  }
}

function main() {
  console.log('[Build] Starting browser extension compilation into ./build ...');

  // Ensure ./build directory exists
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // 1. Build Chromium version (Chrome, Brave, Edge, Opera) in ./build/chromium and ./build/extension (default)
  buildExtension('chrome', 'chromium');
  buildExtension('chrome', 'extension');

  // 2. Build Mozilla Firefox version in ./build/firefox
  buildExtension('firefox', 'firefox');

  // 3. Write a summary README inside ./build
  const buildReadme = `# AutoTyper Pro - Build Output

This directory contains compiled browser extension packages ready to load unpacked into your browser:

- **\`./build/chromium/\`**: For Google Chrome, Microsoft Edge, Brave, and Opera (Chromium Manifest V3).
- **\`./build/firefox/\`**: For Mozilla Firefox (Gecko Manifest V3).
- **\`./build/extension/\`**: Universal Chromium package.

Refer to the root \`README.md\` for step-by-step loading and testing instructions.
`;
  fs.writeFileSync(path.join(buildDir, 'README.md'), buildReadme, 'utf8');

  console.log('[Build] Successfully generated extensions in ./build:');
  console.log(' - ./build/chromium/ (Chrome, Edge, Brave, Opera)');
  console.log(' - ./build/firefox/  (Mozilla Firefox)');
  console.log(' - ./build/extension/ (Default unpacked target)');
}

main();
