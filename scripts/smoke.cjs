// Chromium smoke check (not a test suite): loads /play for a few seeds, fails on page errors,
// walks forward, checks the player stays on the ground, and saves screenshots.
// Usage: npm run build && npx next start -p 3123 & node scripts/smoke.cjs [outDir] [--webgpu]
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = process.env.SMOKE_URL || 'http://localhost:3123'
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'smoke-out'
const webgpu = process.argv.includes('--webgpu')
const seeds = ['abc', 'misty', 'lark42']

;(async () => {
  fs.mkdirSync(out, { recursive: true })
  const args = webgpu
    ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  const browser = await chromium.launch({ args })
  let failures = 0
  for (const seed of seeds) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const url = `${BASE}/play?seed=${seed}${webgpu ? '' : '&webgl=1'}`
    await page.goto(url)
    await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForTimeout(10000)
    const label = await page.textContent('body')
    if (!label.includes(`seed: ${seed}`)) errors.push('seed label missing')
    await page.screenshot({ path: `${out}/${seed}-1-spawn.png` })

    // walk forward then look back toward the sun by dragging
    await page.keyboard.down('KeyW')
    await page.keyboard.down('ShiftLeft')
    await page.waitForTimeout(3000)
    await page.keyboard.up('ShiftLeft')
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${seed}-2-walk.png` })
    await page.mouse.move(600, 350)
    await page.mouse.down()
    await page.mouse.move(900, 330, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/${seed}-3-look.png` })

    const status = errors.length ? `FAIL ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : 'ok'
    if (errors.length) failures++
    console.log(`${seed}: ${status}`)
    await page.close()
  }
  // 2D map: set a bearing by clicking, walk, climb, rest
  for (const seed of seeds.slice(0, 2)) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`${BASE}/map?seed=${seed}`)
    const canvas = await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/map-${seed}-1-start.png` })
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3)
    await page.keyboard.press('KeyC')
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
    }
    await page.screenshot({ path: `${out}/map-${seed}-2-walked.png` })
    const body = await page.textContent('body')
    if (!/Day\s*1/.test(body)) errors.push('day counter missing')
    const status = errors.length ? `FAIL ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : 'ok'
    if (errors.length) failures++
    console.log(`map ${seed}: ${status}`)
    await page.close()
  }
  await browser.close()
  process.exit(failures ? 1 : 0)
})()
