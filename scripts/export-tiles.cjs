// Raster export of the project's original SVG tile sources. No game build required.
const { chromium } = require('playwright');
const { readdir, readFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
(async () => {
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const files = (await readdir('assets')).filter(name => name.endsWith('.svg'));
    for (const name of files) {
      const svg = await readFile(`assets/${name}`, 'utf8');
      const data = await page.evaluate(async source => {
        const img = new Image(); img.src = `data:image/svg+xml;base64,${btoa(source)}`;
        await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
        canvas.getContext('2d').drawImage(img, 0, 0, 32, 32);
        return canvas.toDataURL('image/png').split(',')[1];
      }, svg);
      await writeFile(`assets/${name.replace('.svg', '.png')}`, Buffer.from(data, 'base64'));
    }
    console.log(`Exported ${files.length} PNG tiles.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
