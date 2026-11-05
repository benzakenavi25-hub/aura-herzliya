import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 180, height: 180 } });
await p.goto('http://localhost:5173/privacy.html');
await p.setContent(`<style>html,body{margin:0}</style><img src="http://localhost:5173/favicon.svg" width="180" height="180">`);
await p.waitForTimeout(300);
await p.screenshot({ path: 'apple-touch-icon.png' });
await b.close();
