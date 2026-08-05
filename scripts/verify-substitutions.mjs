// One-off manual verification script (not part of the test suite).
// Drives the real running dev server with a real browser to check the
// uncommitted substitution UI/PDF work against the seeded demo account.
import { chromium } from 'playwright'
import fs from 'node:fs'

const EVENT_ID = 'f4a87b1e-61b9-4199-9a63-22dd3196c45b'
const BASE = 'http://localhost:3000'
const OUT = 'C:/Users/ultra/Projects/sofra/verify-out'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Users/ultra/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })
page.on('console', msg => console.log('[console]', msg.type(), msg.text()))
page.on('pageerror', err => console.log('[pageerror]', err.message, err.stack))
page.on('response', res => { if (res.status() >= 400) console.log('[http]', res.status(), res.url()) })
page.on('requestfailed', req => console.log('[requestfailed]', req.url(), req.failure()?.errorText))

console.log('=== 1. Login as Demo Host ===')
// Next dev's on-demand-entries can evict/recompile a route between our probe
// curls and this run, causing a transient 404 on the first chunk fetch. Warm
// it, wait for webpack to finish emitting, then reload once for a clean load.
await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 60000 }).catch(() => {})
await page.waitForTimeout(4000)
await page.reload({ waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/0-login-page.png`, fullPage: true })
fs.writeFileSync(`${OUT}/0-login-page.html`, await page.content())
await page.waitForSelector('#sofra-name', { timeout: 60000 })
await page.fill('#sofra-name', 'Demo Host')
await page.fill('#sofra-phone', '+10000000001')
await page.click('button:has-text("Enter Sofra")')
await page.waitForURL(/\/events/, { timeout: 15000 })
console.log('logged in, url:', page.url())

console.log('=== 2. Navigate to demo event menu page ===')
await page.goto(`${BASE}/events/${EVENT_ID}/menu`)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/1-initial-menu.png`, fullPage: true })
console.log('screenshot saved: 1-initial-menu.png')

const bodyText1 = await page.innerText('body')
fs.writeFileSync(`${OUT}/1-initial-menu.txt`, bodyText1)
console.log('contains "plated on the side" (ci):', /plated on the side/i.test(bodyText1))
console.log('contains "no substitute available" (ci):', /no substitute available/i.test(bodyText1))
console.log('contains "table fit" (ci):', /table fit/i.test(bodyText1))

console.log('=== 3. Click Regenerate (rule-based) ===')
const regenBtn = page.locator('button.regen', { hasText: 'Regenerate' }).filter({ hasNotText: 'AI' })
if (await regenBtn.count()) {
  page.once('dialog', d => d.accept())
  await regenBtn.click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/2-after-regenerate.png`, fullPage: true })
  const bodyText2 = await page.innerText('body')
  fs.writeFileSync(`${OUT}/2-after-regenerate.txt`, bodyText2)
  console.log('after rule-based regenerate — contains "plated on the side" (ci):', /plated on the side/i.test(bodyText2))
  console.log('after rule-based regenerate — contains "no substitute available" (ci):', /no substitute available/i.test(bodyText2))
} else {
  console.log('!! No "Regenerate" button found on page')
}

console.log('=== 4. Click Regenerate with AI ===')
const aiBtn = page.locator('button.regen', { hasText: 'Regenerate with AI' })
if (await aiBtn.count()) {
  page.once('dialog', d => d.accept())
  await aiBtn.click()
  await page.waitForSelector('button.regen:has-text("Thinking")', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('button.regen:has-text("Regenerate with AI")', { timeout: 60000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/3-after-ai-regenerate.png`, fullPage: true })
  const bodyText3 = await page.innerText('body')
  fs.writeFileSync(`${OUT}/3-after-ai-regenerate.txt`, bodyText3)
  console.log('after AI regenerate — contains "plated on the side" (ci):', /plated on the side/i.test(bodyText3))
  console.log('after AI regenerate — contains "no substitute available" (ci):', /no substitute available/i.test(bodyText3))
  console.log('after AI regenerate — contains "composed for this table" (ci):', /composed for this table/i.test(bodyText3))
} else {
  console.log('!! No "Regenerate with AI" button found on page')
}

console.log('=== 5. Generate PDF ===')
const pdfBtnCandidates = [
  page.locator('button', { hasText: 'Generate menu PDF' }),
]
let popup = null
for (const btn of pdfBtnCandidates) {
  if (await btn.count()) {
    const [p] = await Promise.all([
      page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
      btn.first().click(),
    ])
    popup = p
    if (popup) break
  }
}
if (popup) {
  await popup.waitForLoadState('domcontentloaded')
  await popup.waitForTimeout(500)
  const pdfHtml = await popup.content()
  fs.writeFileSync(`${OUT}/4-pdf-popup.html`, pdfHtml)
  await popup.pdf({ path: `${OUT}/4-menu-export.pdf`, format: 'A4' }).catch(e => console.log('pdf() failed (expected if not Chromium PDF-capable):', e.message))
  await popup.screenshot({ path: `${OUT}/4-pdf-popup.png`, fullPage: true })
  console.log('PDF popup captured: 4-pdf-popup.html / 4-menu-export.pdf / 4-pdf-popup.png')
  console.log('popup HTML contains "plated on the side" (ci):', /plated on the side/i.test(pdfHtml))
  console.log('popup HTML contains "alternative required for" (ci):', /alternative required for/i.test(pdfHtml))
  const popupText = await popup.innerText('body')
  fs.writeFileSync(`${OUT}/4-pdf-popup.txt`, popupText)
} else {
  console.log('!! No PDF popup captured — no matching button found or popup blocked')
}

await browser.close()
console.log('=== DONE ===')
