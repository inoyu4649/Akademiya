import { chromium } from 'playwright-core';
import { existsSync } from 'fs';

const RECAPTCHA_SITE_KEY = '6LcMU1wrAAAAAKaNBG1yA9WftHIRR6_IBSD5ADh5';
const LOGIN_URL = 'https://going.hafs.hs.kr/login/login.php';

/**
 * Playwright를 이용해 reCAPTCHA v3 토큰을 생성합니다.
 * 브라우저에서 실제로 grecaptcha.execute()를 호출하여 유효한 토큰을 획득합니다.
 */
export async function generateRecaptchaToken(executablePath: string | null): Promise<string> {
  let browser = null;

  try {
    const launchOptions: {
      headless: boolean;
      args: string[];
      executablePath?: string;
    } = {
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

    await page.waitForFunction(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (globalThis as any).grecaptcha;
      return typeof g !== 'undefined' && g.ready;
    }, { timeout: 10000 });

    const token = await page.evaluate<string, string>((siteKey) => {
      return new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (globalThis as any).grecaptcha;
        g.ready(() => {
          g.execute(siteKey, { action: 'login' })
            .then(resolve)
            .catch(reject);
        });
      });
    }, RECAPTCHA_SITE_KEY);

    await browser.close();
    return token;

  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    const err = error as Error;
    throw new Error(`reCAPTCHA 토큰 생성 실패: ${err.message}`);
  }
}

/**
 * 시스템에 설치된 Chrome/Chromium 경로를 자동 탐색합니다.
 */
export function findChromePath(): string | null {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const possiblePaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
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
