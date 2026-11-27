// Chromium smoke check (not a test suite): plays /play for a few seeds, fails on page errors, saves screenshots.
// Flow: map → click a bearing → walk → explore on foot (3D) → walk, look around → back to the map (M).
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
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`${BASE}/play?seed=${seed}${webgpu ? '' : '&webgl=1'}`)

    // map layer
    const map = await page.waitForSelector('canvas', { timeout: 30000 })
    await page.waitForTimeout(1000)
    const box = await map.boundingBox()
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3)
    await page.keyboard.press('KeyC')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/${seed}-1-map.png` })
    if (!/Day\s*1/.test(await page.textContent('body'))) errors.push('day counter missing')

    // 3D stop scene
    await page.keyboard.press('KeyX')
    await page.waitForFunction(() => document.body.textContent.includes('back to the map'), null, { timeout: 30000 })
    await page.waitForTimeout(10000)
    await page.screenshot({ path: `${out}/${seed}-2-scene.png` })
    await page.keyboard.down('KeyW')
    await page.keyboard.down('ShiftLeft')
    await page.waitForTimeout(3000)
    await page.keyboard.up('ShiftLeft')
    await page.keyboard.up('KeyW')
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(850, 380, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/${seed}-3-walk.png` })

    // back to the map
    await page.keyboard.press('KeyM')
    await page.waitForFunction(() => document.body.textContent.includes('You explore on foot'), null, { timeout: 15000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/${seed}-4-back.png` })

    const status = errors.length ? `FAIL ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : 'ok'
    if (errors.length) failures++
    console.log(`${seed}: ${status}`)
    await page.close()
  }
  await browser.close()
  process.exit(failures ? 1 : 0)
})()
