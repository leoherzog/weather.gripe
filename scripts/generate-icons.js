#!/usr/bin/env node

/**
 * Generate PWA icons from favicon.svg
 * Run: node scripts/generate-icons.js
 * Requires: npm install sharp (dev dependency)
 */

import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '../frontend/static/icons');
const FAVICON_SVG = join(ICONS_DIR, 'favicon.svg');

// Extract path data from favicon.svg
async function extractPaths() {
  const svg = await readFile(FAVICON_SVG, 'utf-8');

  // Extract all path elements with their attributes
  const pathRegex = /<path([^>]*)\/>/g;
  const paths = [];
  let match;

  while ((match = pathRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const dMatch = attrs.match(/d="([^"]*)"/);
    const opacityMatch = attrs.match(/opacity="([^"]*)"/);

    if (dMatch) {
      paths.push({
        d: dMatch[1],
        opacity: opacityMatch ? parseFloat(opacityMatch[1]) : 1,
      });
    }
  }

  // Sort by opacity - secondary (low opacity) first, then primary
  paths.sort((a, b) => a.opacity - b.opacity);

  return {
    secondary: paths.find((p) => p.opacity < 1)?.d || '',
    primary: paths.find((p) => p.opacity === 1)?.d || paths[paths.length - 1]?.d || '',
  };
}

// Create SVG with gold background and dark icon
const createSvg = (size, paths, maskable = false) => {
  // Maskable icons need safe zone - icon should be 80% of total size
  const padding = maskable ? size * 0.1 : size * 0.05;
  const iconSize = size - padding * 2;
  const scale = iconSize / 640;
  const cornerRadius = maskable ? 0 : size * 0.125;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="#ffd700"/>
  <g transform="translate(${padding}, ${padding}) scale(${scale})">
    ${paths.secondary ? `<path fill="#1a1a1a" opacity="0.4" d="${paths.secondary}"/>` : ''}
    <path fill="#1a1a1a" d="${paths.primary}"/>
  </g>
</svg>`;
};

// Apple touch icon: gold bg, no rounded corners (iOS applies its own mask)
const createAppleTouchSvg = (size, paths) => {
  const padding = size * 0.08;
  const iconSize = size - padding * 2;
  const scale = iconSize / 640;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#ffd700"/>
  <g transform="translate(${padding}, ${padding}) scale(${scale})">
    ${paths.secondary ? `<path fill="#1a1a1a" opacity="0.4" d="${paths.secondary}"/>` : ''}
    <path fill="#1a1a1a" d="${paths.primary}"/>
  </g>
</svg>`;
};

const icons = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, apple: true },
  { name: 'favicon-32.png', size: 32, maskable: false },
];

async function generateIcons() {
  await mkdir(ICONS_DIR, { recursive: true });

  console.log('Reading paths from favicon.svg...');
  const paths = await extractPaths();

  if (!paths.primary) {
    console.error('Error: Could not extract path data from favicon.svg');
    process.exit(1);
  }

  console.log(`Found ${paths.secondary ? '2 paths' : '1 path'} in favicon.svg\n`);

  for (const icon of icons) {
    const svg = icon.apple
      ? createAppleTouchSvg(icon.size, paths)
      : createSvg(icon.size, paths, icon.maskable);

    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    await writeFile(join(ICONS_DIR, icon.name), buffer);
    console.log(`Generated ${icon.name}`);
  }

  // Generate favicon.ico from 32px PNG
  const favicon32 = await sharp(Buffer.from(createSvg(32, paths, false)))
    .png()
    .toBuffer();

  await writeFile(join(ICONS_DIR, 'favicon.ico'), favicon32);
  console.log('Generated favicon.ico (32x32 PNG)');

  console.log('\nDone! Icons generated in frontend/static/icons/');
}

generateIcons().catch(console.error);
