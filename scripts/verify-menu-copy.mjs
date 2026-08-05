// One-off manual verification script (not part of the test suite).
// Checks the "Set the Table" rename, removed rule-based Regenerate button,
// and "Enough for ~N bellies" portion copy against the running dev server.
import { chromium } from 'playwright'

const EVENT_ID = 'f4a87b1e-61b9-4199-9a63-22dd3196c45b'
const BASE = 'http://localhost:3000'

const browser = await chromium.launch({
  executablePath: 'C:/Users/ultra/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } })

await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 60000 }).catch(() => {})
await page.waitForTimeout(2000)
await page.reload({ waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('#sofra-name', { timeout: 60000 })
await page.fill('#sofra-name', 'Demo Host')
await page.fill('#sofra-phone', '+10000000001')
await page.click('button:has-text("Enter Sofra")')
await page.waitForURL(/\/events/, { timeout: 15000 })

await page.goto(`${BASE}/events/${EVENT_ID}/menu`)
await page.waitForTimeout(3000)

const bodyText = await page.innerText('body')
console.log('contains "Set the Table":', bodyText.includes('Set the Table'))
console.log('contains old "↻ Regenerate" (should be false):', /↻\s*Regenerate/.test(bodyText))
console.log('contains old "Regenerate with AI" (should be false):', bodyText.includes('Regenerate with AI'))
console.log('contains "Enough for" bellies copy:', /Enough for ~\d+ bellies/.test(bodyText))
console.log('contains old "Portion: feeds" (should be false):', bodyText.includes('Portion: feeds'))

const regenButtons = await page.locator('button.regen').allInnerTexts()
console.log('regen buttons found:', regenButtons)

await browser.close()
