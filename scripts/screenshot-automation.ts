#!/usr/bin/env npx ts-node
/**
 * Automated screenshot capture from live app
 * Usage: npx ts-node scripts/screenshot-automation.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_URL = 'https://jsmdev-app.azurewebsites.net';
const EMAIL = process.env.TEST_EMAIL || 'bogdan.cimpeanu@nagarro.com';
const PASSWORD = process.env.TEST_PASSWORD || '';
const SCREENSHOT_DIR = path.join(__dirname, '../docs/screens');
const THUMB_DIR = path.join(SCREENSHOT_DIR, 'thumbs');

const screenshots: { name: string; path: string }[] = [];

async function ensureDirs() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  }
}

async function createThumbnail(inputPath: string, outputPath: string) {
  // Just copy for now; in production you'd use sharp or ImageMagick
  fs.copyFileSync(inputPath, outputPath);
}

async function captureScreenshot(page: any, label: string, picNum: number) {
  const filename = `pic_${picNum}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  const thumbpath = path.join(THUMB_DIR, filename);

  console.log(`📸 Capturing: ${label}...`);

  try {
    await page.screenshot({ path: filepath, fullPage: false });
    await createThumbnail(filepath, thumbpath);
    screenshots.push({ name: label, path: filename });
    console.log(`   ✓ ${filename}`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}`);
  }
}

async function main() {
  if (!PASSWORD) {
    console.error('❌ Password not provided. Set TEST_PASSWORD env var');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  let picNum = 1;

  try {
    console.log(`\n🌐 Navigating to: ${APP_URL}\n`);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });

    // Login
    console.log('🔓 Logging in...');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }

    // Wait for page to load after login (either projects page or error)
    try {
      await page.waitForSelector('[role="main"]', { timeout: 8000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    } catch {
      console.log('⚠️  Login might have failed, continuing anyway...');
    }

    const currentUrl = page.url();
    console.log(`✓ Logged in - Current URL: ${currentUrl}\n`);

    // Screenshot: Projects list
    await captureScreenshot(page, 'Projects list', picNum++);

    // Find and click on first project (try different selectors)
    let projectLink = await page.$('a[href*="/projects/"][href*="/edit"]');
    if (!projectLink) projectLink = await page.$('a[href*="/projects/"]');
    if (!projectLink) projectLink = await page.$('div[data-testid*="project"]');

    console.log(`Looking for project link...`);
    const allLinks = await page.$$('a');
    for (const link of allLinks) {
      const href = await link.getAttribute('href');
      if (href?.includes('/projects/')) {
        projectLink = link;
        console.log(`Found project: ${href}`);
        break;
      }
    }

    if (projectLink) {
      await projectLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Screenshot: Workspace overview
      await page.waitForLoadState('domcontentloaded');
      await captureScreenshot(page, 'Project workspace', picNum++);

      // Wait for tabs to be available
      await page.waitForSelector('button[role="tab"]', { timeout: 5000 }).catch(() => {});

      // Schema tab
      const tabs = await page.$$('button[role="tab"]');
      console.log(`   Found ${tabs.length} tabs`);

      for (const tab of tabs) {
        const text = await tab.textContent();
        console.log(`   - Tab: "${text}"`);
        if (text?.toLowerCase().includes('schema')) {
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'Schema Explorer', picNum++);
          break;
        }
      }

      // Mapping tab
      let tabsRefreshed = await page.$$('button[role="tab"]');
      for (const tab of tabsRefreshed) {
        const text = await tab.textContent();
        if (text?.toLowerCase().includes('mapping')) {
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'Mapping Explorer', picNum++);
          break;
        }
      }

      // Validation tab
      tabsRefreshed = await page.$$('button[role="tab"]');
      for (const tab of tabsRefreshed) {
        const text = await tab.textContent();
        if (text?.toLowerCase().includes('validation')) {
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'Validation Panel', picNum++);
          break;
        }
      }

      // Diff tab
      tabsRefreshed = await page.$$('button[role="tab"]');
      for (const tab of tabsRefreshed) {
        const text = await tab.textContent();
        if (text?.toLowerCase().includes('diff')) {
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'Diff Panel', picNum++);
          break;
        }
      }

      // Tools tab
      tabsRefreshed = await page.$$('button[role="tab"]');
      for (const tab of tabsRefreshed) {
        const text = await tab.textContent();
        if (text?.toLowerCase().includes('tools')) {
          await tab.click();
          await page.waitForTimeout(1000);
          await captureScreenshot(page, 'Tools Panel', picNum++);
          break;
        }
      }
    }

    console.log(`\n✅ Captured ${screenshots.length} screenshots\n`);
    console.log('📋 Screenshots captured:');
    screenshots.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} → ${s.path}`);
    });

    console.log(`\n📁 Saved to: ${SCREENSHOT_DIR}\n`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

main();
