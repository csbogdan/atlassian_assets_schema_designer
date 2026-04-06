#!/usr/bin/env npx ts-node
/**
 * Capture screenshots from the live app
 * Usage: npx ts-node scripts/capture-live-screenshots.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL = process.env.LIVE_APP_URL || 'https://jsmdev-app.azurewebsites.net';
const SCREENSHOT_DIR = path.join(__dirname, '../docs/screens');
const THUMB_DIR = path.join(SCREENSHOT_DIR, 'thumbs');

async function ensureDirs() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  }
}

async function captureScreenshot(page: any, name: string, num: number) {
  const filename = `pic_${num}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  const thumbpath = path.join(THUMB_DIR, filename);

  console.log(`📸 Capturing: ${name}`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   ✓ ${filepath}`);

  // Create thumbnail (simple version: just resize)
  // In production, you'd use sharp or similar
  console.log(`   ✓ ${thumbpath} (copy of full screenshot)`);
  fs.copyFileSync(filepath, thumbpath);
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    console.log(`\n🌐 Navigating to: ${APP_URL}\n`);
    await page.goto(APP_URL, { waitUntil: 'networkidle' });

    let picNum = 1;

    // Screenshot 1: Login/Home
    await captureScreenshot(page, 'Login / Home page', picNum++);

    // Try to navigate to a project (if already logged in)
    // This will depend on your actual app state
    const projectLink = await page.$('a[href*="/projects/"]');
    if (projectLink) {
      await projectLink.click();
      await page.waitForLoadState('networkidle');
      await captureScreenshot(page, 'Project workspace', picNum++);

      // Try schema tree
      const schemaTab = await page.$('[role="tab"]:has-text("Schema")');
      if (schemaTab) {
        await schemaTab.click();
        await page.waitForTimeout(500);
        await captureScreenshot(page, 'Schema tree view', picNum++);
      }

      // Try validation
      const validationTab = await page.$('[role="tab"]:has-text("Validation")');
      if (validationTab) {
        await validationTab.click();
        await page.waitForTimeout(500);
        await captureScreenshot(page, 'Validation panel', picNum++);
      }

      // Try mapping
      const mappingTab = await page.$('[role="tab"]:has-text("Mapping")');
      if (mappingTab) {
        await mappingTab.click();
        await page.waitForTimeout(500);
        await captureScreenshot(page, 'Mapping explorer', picNum++);
      }

      // Try diff
      const diffTab = await page.$('[role="tab"]:has-text("Diff")');
      if (diffTab) {
        await diffTab.click();
        await page.waitForTimeout(500);
        await captureScreenshot(page, 'Diff panel', picNum++);
      }

      // Try tools
      const toolsTab = await page.$('[role="tab"]:has-text("Tools")');
      if (toolsTab) {
        await toolsTab.click();
        await page.waitForTimeout(500);
        await captureScreenshot(page, 'Tools panel', picNum++);
      }
    }

    console.log(`\n✅ Screenshots captured to: ${SCREENSHOT_DIR}\n`);
  } catch (error) {
    console.error('❌ Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

main();
