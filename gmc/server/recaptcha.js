import { chromium } from 'playwright-core';
import { existsSync } from 'fs';

const RECAPTCHA_SITE_KEY = '6LcMU1wrAAAAAKaNBG1yA9WftHIRR6_IBSD5ADh5';
const LOGIN_URL = 'https://going.hafs.hs.kr/login/login.php';

/**
 * Playwright를 이용해 reCAPTCHA v3 토큰을 생성합니다.
 * 브라우저에서 실제로 grecaptcha.execute()를 호출하여 유효한 토큰을 획득합니다.
 */
export async function generateRecaptchaToken(executablePath) {
  let browser = null;

  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 15000 });

    // reCAPTCHA v3가 로드될 때까지 대기
    await page.waitForFunction(() => typeof grecaptcha !== 'undefined' && grecaptcha.ready, {
      timeout: 10000,
    });

    // grecaptcha.execute()로 토큰 생성
    const token = await page.evaluate((siteKey) => {
      return new Promise((resolve, reject) => {
        grecaptcha.ready(() => {
          grecaptcha.execute(siteKey, { action: 'login' })
            .then(resolve)
            .catch(reject);
        });
      });
    }, RECAPTCHA_SITE_KEY);

    await browser.close();
    return token;

  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    throw new Error(`reCAPTCHA 토큰 생성 실패: ${error.message}`);
  }
}

/**
 * 시스템에 설치된 Chrome/Chromium 경로를 자동 탐색합니다.
 */
export function findChromePath() {
  // 환경변수 우선
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const possiblePaths = [
    // Linux (ARM/x86)
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of possiblePaths) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // continue
    }
  }
  return null;
}
