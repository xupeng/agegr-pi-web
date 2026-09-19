// Read-only browser regression against an existing real session. No model calls or session writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const base = process.env.CLICKABLE_BASE || 'http://192.168.11.47:8505';
const out = '.trellis/tasks/09-19-clickable-file-paths/research';
const legacy = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell`;
const browser = await chromium.launch({headless:true, executablePath:process.env.CLICKABLE_CHROMIUM || (existsSync(legacy) ? legacy : undefined)});
const page = await browser.newPage({viewport:{width:1280,height:800}});
const results = [];
const shot = async name => { const path=`${out}/browser-${name}.png`; await page.screenshot({path}); return path; };
async function check(name, fn) { try { const evidence=await fn(); results.push({name,status:'PASS',evidence}); } catch(error) { results.push({name,status:'FAIL',error:String(error),screenshot:await shot(`${name}-failure`)}); } console.log(JSON.stringify(results.at(-1))); }
try {
 // Request the real API's supported larger history window, not fabricated messages.
 await page.route('**/api/sessions/*?*', async route => { const url=new URL(route.request().url()); url.searchParams.set('tail','1000'); await route.fulfill({response:await route.fetch({url:url.toString()})}); });
 let releaseIndex;
 const indexGate=new Promise(resolve=>{releaseIndex=resolve;});
 await page.route('**/api/file-index?*',async route=>{await indexGate; await route.continue();});
 await page.goto(`${base}/?session=01a0b31b-c1c4-70fe-9c01-21d8ed51577c`);
 await page.locator('section[aria-label="Files changed"]').first().waitFor({timeout:180000});
 await check('AC8-loading',async()=>{assert.equal(await page.locator('a.markdown-inline-code').count(),0); return {assertion:'No inline-code links while file-index response is held',screenshot:await shot('index-loading')};});
 releaseIndex();
 await page.locator('a.markdown-inline-code').first().waitFor({timeout:60000});
 await check('AC7',async()=>{const link=page.locator('a.markdown-inline-code').filter({hasText:/^lib\/auth-throttle\.ts$/}).first(); await link.click(); const viewer=page.locator('.file-viewer-path'); await viewer.waitFor(); assert.match(await viewer.getAttribute('title'),/\/lib\/auth-throttle\.ts$/); assert.match(await page.locator('.file-viewer-shell').innerText(),/recordAuthFailure/); return {assertion:'Real inline-code click opens lib/auth-throttle.ts and recordAuthFailure content',screenshot:await shot('inline-open')};});
 await check('AC8-missing',async()=>{const code=page.locator('code').filter({hasText:'/tmp/baseline-lint.txt'}).first(); assert.equal(await code.count(),1); assert.equal(await code.locator('xpath=ancestor::a').count(),0); assert.equal(await page.locator('a').filter({hasText:'/tmp/baseline-lint.txt'}).count(),0); await code.scrollIntoViewIfNeeded(); return {assertion:'Out-of-index /tmp/baseline-lint.txt remains plain code, with no ancestor anchor',screenshot:await shot('missing-plain')};});
 await check('AC10',async()=>{
  const processes=page.getByRole('button',{name:/^Process details/});
  for(let i=0;i<await processes.count();i++){const b=processes.nth(i); if(await b.getAttribute('aria-expanded')==='false') await b.click();}
  const tools=page.getByRole('button').filter({hasText:/^bash/});
  let resultLink;
  for(let i=0;i<Math.min(await tools.count(),45);i++){await tools.nth(i).click(); const links=page.locator('pre[style*="max-height: 400px"] a'); if(await links.count()){resultLink=links.first(); break;}}
  assert.ok(resultLink,'expanded tool result contains an indexed path'); const href=await resultLink.getAttribute('href'); await resultLink.click(); await page.waitForTimeout(2000); const title=await page.locator('.file-viewer-path').getAttribute('title'); assert.ok(title.endsWith(decodeURIComponent(href).replace(/^file:\/\//,'')) || href.endsWith(title),`${href} -> ${title}`); return {href,title,screenshot:await shot('tool-result-open')};
 });
 await check('AC11-cards',async()=>{
  const card=page.locator('section[aria-label="Files changed"] button[title$="09-18-sync-upstream-post-v091/prd.md"]').first().locator('..').locator('..');
  assert.match(await card.innerText(),/prd\.md\s+Document · MD\s+\+6\s+-0/);
  await card.getByRole('button',{name:'File actions',exact:true}).click();
  for(const name of ['Open preview','Open diff','Copy path']) assert.equal(await card.getByRole('button',{name,exact:true}).count(),1);
  await card.scrollIntoViewIfNeeded(); return {assertion:'Real loaded prd.md card has Document · MD, +6/-0 and all actions (historical +81/-10 lies outside loaded tail)',screenshot:await shot('cards-desktop')};
 });
 await check('AC11-diff',async()=>{
  await page.goto(`${base}/?session=01a040c0-9c31-767e-a1db-d15e640d0961`);
  const button=page.locator('section[aria-label="Files changed"] button[title$="/app/globals.css"]').first();
  await page.locator('section[aria-label="Files changed"]').first().waitFor({timeout:60000});
  await button.waitFor({timeout:10000});
  const card=button.locator('..').locator('..');
  await card.getByRole('button',{name:'File actions',exact:true}).click(); await card.getByRole('button',{name:'Open diff',exact:true}).click();
  await page.waitForTimeout(2000); assert.match(await page.locator('.file-viewer-path').getAttribute('title'),/\/app\/globals\.css$/);
  assert.equal(await page.locator('.file-viewer-mode-button').filter({hasText:/^Diff$/}).getAttribute('aria-pressed'),'true'); return {assertion:'Real historical session card Open diff opens app/globals.css with Diff aria-pressed=true',screenshot:await shot('card-diff')};
 });
 await check('AC11-mobile',async()=>{
  await page.setViewportSize({width:390,height:844});
  // A fresh URL navigation closes the file pane without mutating sessions.
  await page.goto(`${base}/?session=01a0b31b-c1c4-70fe-9c01-21d8ed51577c`);
  const button=page.locator('section[aria-label="Files changed"] button[title$="09-18-sync-upstream-post-v091/prd.md"]').first(); await button.waitFor({timeout:180000});
  const card=button.locator('..').locator('..'); await card.getByRole('button',{name:'File actions',exact:true}).click(); await card.scrollIntoViewIfNeeded();
  const bounds=await card.boundingBox(); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390,JSON.stringify(bounds));
  const overflow=await card.evaluate(e=>e.scrollWidth>e.clientWidth); assert.equal(overflow,false);
  return {bounds,assertion:'390x844 card remains within viewport, no horizontal overflow',screenshot:await shot('cards-mobile')};
 });
 results.push({name:'AC6',status:'NOT COVERED',reason:'Real session predates writtenFiles snapshot producer; no new Agent run or fabricated persisted notification used.'});
} finally {writeFileSync(`${out}/browser-results.json`,JSON.stringify(results,null,2)); await browser.close();}
if(results.some(r=>r.status==='FAIL')) process.exitCode=1;
