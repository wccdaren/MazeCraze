// Rasterize original SVG drawings and render the optional illustrated map atlas.
// The separately generated homecoming illustration is copied as-is, never edited.
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { readdir, readFile, writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const dir = path.resolve('maps/meno'), art = path.join(dir, 'assets');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const names = (await readdir(art)).filter(n => n.endsWith('.svg')).sort();
    const images = {};
    for (const name of names) {
      const source = await readFile(path.join(art,name),'utf8');
      const data = await page.evaluate(async source => {
        const img = new Image(); img.src = `data:image/svg+xml;base64,${btoa(source)}`; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
        canvas.getContext('2d').drawImage(img,0,0);
        return canvas.toDataURL('image/png').split(',')[1];
      },source);
      await writeFile(path.join(art,name.replace('.svg','.png')),Buffer.from(data,'base64'));
      images[name.slice(0,-4)] = 'data:image/png;base64,'+data;
    }
    await mkdir(path.join(dir,'atlas'),{recursive:true});
    await page.setViewportSize({width:1000,height:900});
    await page.setContent(`<style>body{margin:0;padding:32px;background:#092c43;color:#f7e4bd;font:16px system-ui}h1{font:36px Georgia;margin:0 0 8px}p{color:#b9e3d9}main{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}.asset{background:#143f59;border-radius:12px;padding:10px;text-align:center}img{width:64px;height:64px;image-rendering:pixelated}.asset span{display:block;font-size:13px;margin-top:4px}</style><h1>Meno · The Tidelight Trail</h1><p>Original ocean tiles · 32 × 32 pixels · SVG sources and PNG files included</p><main>${Object.entries(images).map(([n,u])=>`<div class="asset"><img src="${u}" alt=""><span>${n}</span></div>`).join('')}</main>`);
    await page.screenshot({path:path.join(dir,'atlas','asset-catalog.png'),fullPage:true});
    const solution = JSON.parse(await readFile(path.join(dir,'solution.json'),'utf8'));
    const { parseMap } = await import('../js/spec.js');
    for (const m of solution) {
      const parsed = parseMap(await readFile(path.join(dir,`map-${m.id}.txt`),'utf8'),m.id);
      const blocks = Object.fromEntries([...parsed.byNID].map(([nid,b])=>[nid,b.image.slice(5).replace(/[A-Z]/g,(c,i)=>(i?'-':'')+c.toLowerCase())]));
      // Alias names begin Meno; slice(5) drops '@Meno'.
      const data = { ...m, blocks, cells:parsed.cells, images };
      const base = await page.evaluate(async data => {
        const canvas=document.createElement('canvas');canvas.width=880;canvas.height=790;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#092c43';ctx.fillRect(0,0,880,790);
        ctx.fillStyle='#f7e4bd';ctx.font='28px Georgia';ctx.fillText(`${data.id}. ${data.name}`,40,40);
        ctx.font='15px sans-serif';ctx.fillStyle='#b9e3d9';ctx.fillText('X increases right →   Y increases upward ↑   Start (2,2)',40,69);
        const loaded={};for(const [name,url]of Object.entries(data.images)){const img=new Image();img.src=url;await img.decode();loaded[name]=img;}
        for(let y=1;y<=19;y++)for(let x=1;x<=25;x++){const img=loaded[data.blocks[data.cells[y-1][x-1]]];if(img)ctx.drawImage(img,40+(x-1)*32,100+(19-y)*32);}
        ctx.lineWidth=3;ctx.strokeStyle='#ffe59a';ctx.setLineDash([5,5]);ctx.beginPath();
        data.path.forEach(([x,y],i)=>{const px=40+(x-.5)*32,py=100+(19-y+.5)*32;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();ctx.setLineDash([]);
        data.events.forEach((e,i)=>{const x=40+(e.at[0]-.5)*32,y=100+(19-e.at[1]+.5)*32;ctx.fillStyle='#fff1ba';ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#12364e';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(i+1,x,y+4);});
        ctx.font='12px sans-serif';ctx.fillStyle='#b9e3d9';ctx.textAlign='center';for(let x=1;x<=25;x++)ctx.fillText(x,40+(x-.5)*32,725);
        for(let y=1;y<=19;y++)ctx.fillText(y,23,100+(19-y+.5)*32+4);
        ctx.textAlign='left';ctx.font='15px sans-serif';ctx.fillText('SPOILERS · Follow the dotted route. Numbered encounters match the walkthrough.',40,762);
        return canvas.toDataURL('image/png').split(',')[1];
      },data);
      await writeFile(path.join(dir,'atlas',`solution-${m.id}.png`),Buffer.from(base,'base64'));
    }
    console.log(`Exported ${names.length} new PNG tiles, contact sheet, and seven solution maps.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
