/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { DEFAULT_SNIPPETS, DEFAULT_SETTINGS } from '../src/data/defaultSnippets.ts';
import { generateExtensionFiles } from '../src/utils/extensionGenerator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function createZipArchive(target: 'chrome' | 'firefox', outputFileName: string): Promise<string> {
  const zip = new JSZip();
  const files = generateExtensionFiles(DEFAULT_SNIPPETS, DEFAULT_SETTINGS, target);

  for (const file of files) {
    if (file.encoding === 'base64') {
      zip.file(file.path, Buffer.from(file.content, 'base64'));
    } else {
      zip.file(file.path, file.content);
    }
  }

  // Include LICENSE if available
  const licensePath = path.join(rootDir, 'LICENSE');
  if (fs.existsSync(licensePath)) {
    zip.file('LICENSE', fs.readFileSync(licensePath, 'utf8'));
  }

  const outputPath = path.join(releaseDir, outputFileName);
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(outputPath, content);
  return outputPath;
}

function computeSha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  console.log('====================================================');
  console.log('   AutoTyper Pro — GitHub Release Packager');
  console.log('====================================================\n');

  const version = getVersion();
  console.log(`[Package] Target Version: v${version}`);

  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  const chromiumZipName = `autotyper-pro-chromium-v${version}.zip`;
  const firefoxZipName = `autotyper-pro-firefox-v${version}.zip`;

  console.log(`[Package] Building ${chromiumZipName} ...`);
  const chromiumPath = await createZipArchive('chrome', chromiumZipName);
  const chromiumHash = computeSha256(chromiumPath);
  const chromiumSize = (fs.statSync(chromiumPath).size / 1024).toFixed(1);

  console.log(`[Package] Building ${firefoxZipName} ...`);
  const firefoxPath = await createZipArchive('firefox', firefoxZipName);
  const firefoxHash = computeSha256(firefoxPath);
  const firefoxSize = (fs.statSync(firefoxPath).size / 1024).toFixed(1);

  // Write checksums file
  const checksumsFile = path.join(releaseDir, 'SHA256SUMS.txt');
  const checksumContent = `${chromiumHash}  ${chromiumZipName}\n${firefoxHash}  ${firefoxZipName}\n`;
  fs.writeFileSync(checksumsFile, checksumContent, 'utf8');

  console.log('\n====================================================');
  console.log('   Release Archives Packaged Successfully!');
  console.log('====================================================\n');
  console.log(`📦 Output Directory: ./release/\n`);
  console.log(`1. ${chromiumZipName}`);
  console.log(`   - Size:   ${chromiumSize} KB`);
  console.log(`   - Target: Chrome, Brave, Edge, Opera, Vivaldi`);
  console.log(`   - SHA256: ${chromiumHash}\n`);
  console.log(`2. ${firefoxZipName}`);
  console.log(`   - Size:   ${firefoxSize} KB`);
  console.log(`   - Target: Mozilla Firefox (Gecko MV3)`);
  console.log(`   - SHA256: ${firefoxHash}\n`);
  console.log(`3. SHA256SUMS.txt`);
  console.log(`   - Checksums file generated for release verification.\n`);
  console.log('Attach these ZIP files to your GitHub Release page so your friends can install them with zero compilation!\n');
}

main().catch((err) => {
  console.error('[Package] Failed to build release archives:', err);
  process.exit(1);
});
