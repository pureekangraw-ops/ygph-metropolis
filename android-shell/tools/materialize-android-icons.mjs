import sharp from 'sharp';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APPROVED_ICON_SOURCE = 'lighthouse-next/assets/lighthouse-icon.svg';
export const APPROVED_MASKABLE_ICON_SOURCE = 'lighthouse-next/assets/lighthouse-icon-maskable.svg';
export const LAUNCHER_BACKGROUND = '#0B0E14';

const DENSITIES = Object.freeze({
  mdpi: { flat: 48, foreground: 108 },
  hdpi: { flat: 72, foreground: 162 },
  xhdpi: { flat: 96, foreground: 216 },
  xxhdpi: { flat: 144, foreground: 324 },
  xxxhdpi: { flat: 192, foreground: 432 },
});

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function requireApprovedSources(repoRoot) {
  const iconPath = join(repoRoot, APPROVED_ICON_SOURCE);
  const maskablePath = join(repoRoot, APPROVED_MASKABLE_ICON_SOURCE);
  if (!(await exists(iconPath)) || !(await exists(maskablePath))) {
    throw new Error('LIGHTHOUSE_APPROVED_ICON_MISSING');
  }
  return { iconPath, maskablePath };
}

async function transparentMaskableSvg({ iconPath, maskablePath }) {
  const [iconSvg, maskableSvg] = await Promise.all([
    readFile(iconPath, 'utf8'),
    readFile(maskablePath, 'utf8'),
  ]);

  if (!maskableSvg.includes('href="./lighthouse-icon.svg"')) {
    throw new Error('LIGHTHOUSE_MASKABLE_ICON_REFERENCE_INVALID');
  }

  const embeddedIcon = `data:image/svg+xml;base64,${Buffer.from(iconSvg, 'utf8').toString('base64')}`;
  const transparent = maskableSvg
    .replace(/\s*<rect\b[^>]*fill="#0B0E14"[^>]*\/>/i, '')
    .replace('href="./lighthouse-icon.svg"', `href="${embeddedIcon}"`);

  return Buffer.from(transparent, 'utf8');
}

async function writeAdaptiveResources(resRoot) {
  const adaptiveDir = join(resRoot, 'mipmap-anydpi-v26');
  const valuesDir = join(resRoot, 'values');
  await mkdir(adaptiveDir, { recursive: true });
  await mkdir(valuesDir, { recursive: true });

  const adaptiveXml = `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
  await Promise.all([
    writeFile(join(adaptiveDir, 'ic_launcher.xml'), adaptiveXml, 'utf8'),
    writeFile(join(adaptiveDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8'),
    writeFile(
      join(valuesDir, 'ic_launcher_background.xml'),
      `<resources>\n  <color name="ic_launcher_background">${LAUNCHER_BACKGROUND}</color>\n</resources>\n`,
      'utf8',
    ),
  ]);
}

export async function materializeAndroidIcons({ repoRoot, androidRoot }) {
  if (!repoRoot || !androidRoot) throw new Error('LIGHTHOUSE_ANDROID_ICON_PATH_REQUIRED');
  const { iconPath, maskablePath } = await requireApprovedSources(repoRoot);
  const foregroundSvg = await transparentMaskableSvg({ iconPath, maskablePath });
  const resRoot = join(androidRoot, 'app', 'src', 'main', 'res');

  for (const [density, sizes] of Object.entries(DENSITIES)) {
    const directory = join(resRoot, `mipmap-${density}`);
    await mkdir(directory, { recursive: true });

    await sharp(iconPath)
      .resize(sizes.flat, sizes.flat, { fit: 'contain' })
      .png()
      .toFile(join(directory, 'ic_launcher.png'));
    await sharp(iconPath)
      .resize(sizes.flat, sizes.flat, { fit: 'contain' })
      .png()
      .toFile(join(directory, 'ic_launcher_round.png'));
    await sharp(foregroundSvg)
      .resize(sizes.foreground, sizes.foreground, { fit: 'fill' })
      .png()
      .toFile(join(directory, 'ic_launcher_foreground.png'));
  }

  await writeAdaptiveResources(resRoot);
  return {
    approvedIconSource: APPROVED_ICON_SOURCE,
    approvedMaskableIconSource: APPROVED_MASKABLE_ICON_SOURCE,
    launcherBackground: LAUNCHER_BACKGROUND,
    densities: Object.keys(DENSITIES),
  };
}

async function main() {
  const [, , androidRootArg] = process.argv;
  const shellRoot = fileURLToPath(new URL('..', import.meta.url));
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const androidRoot = androidRootArg ? join(shellRoot, androidRootArg) : join(shellRoot, 'android');
  const result = await materializeAndroidIcons({ repoRoot, androidRoot });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
