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
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }

  console.log(`[Build] Generated ${files.length} extension files in ${path.relative(rootDir, targetDir)}`);
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
