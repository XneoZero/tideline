const {chromium}=require('playwright');
(async()=>{
  const {createApp}=await import('../src/server.mjs');
  const {createStore}=await import('../src/core.mjs');
  const store=createStore();
  store.saveSource({id:'demo',name:'演示信号 · 非真实新闻',type:'demo'});
  const server=createApp(store).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.selectOption('#source','demo');
    await page.click('#refresh');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('采集完成'));
    await page.screenshot({path:'docs/demo-desktop.png',fullPage:true});

    await page.click('nav [data-view=signals]');
    await page.waitForSelector('.card');
    await page.click('[data-detail]');
    await page.waitForSelector('dialog[open]');
    await page.click('#close');
    await page.click('[data-save]');
    await page.click('#saved');
    await page.waitForSelector('.card');

    await page.click('nav [data-view=settings]');
    await page.waitForSelector('#add');
    await page.fill('[name=name]','QA 人物订阅');
    await page.selectOption('[name=kind]','x_person');
    await page.fill('[name=url]','https://example.com/test.json');
    await page.fill('[name=handle]','test');
    await page.click('#add button');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已添加并启用'));

    const sourceRow=page.locator('.source-row',{hasText:'QA 人物订阅'});
    await sourceRow.locator('[data-source-toggle]').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已停用，批量采集会跳过'));
    if(await sourceRow.locator('.badge.warning').count()!==1)throw new Error('停用状态标签缺失');
    await page.selectOption('#source',{label:'QA 人物订阅（已停用）'});
    if(!(await page.isDisabled('#refresh')))throw new Error('停用来源的手动采集按钮仍可用');
    if(!(await page.textContent('#sourceHint')).includes('已停用'))throw new Error('停用来源提示缺失');
    const manual=await page.evaluate(async()=>{
      const sources=await (await fetch('/api/v1/sources')).json();
      const source=sources.find(s=>s.name==='QA 人物订阅');
      const response=await fetch('/api/v1/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:source.id})});
      return {status:response.status,body:await response.json()};
    });
    if(manual.status!==409||!manual.body.error.includes('已停用'))throw new Error('停用来源的手动采集未返回明确错误');

    await sourceRow.locator('[data-source-toggle]').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已启用'));
    if(await page.isDisabled('#refresh'))throw new Error('重新启用后采集按钮仍禁用');

    await page.setInputFiles('#import-file',{name:'test-public.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({signals:[{originalTitle:'QA 测试夹具 · 非真实新闻',originalBody:'fixture',originalUrl:'https://example.com/qa',sourceKind:'x_person',authorHandle:'test',title:'QA 公开导出测试',summaryZh:'仅用于导入流程测试'}]}))});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已导入'));
    await page.click('nav [data-view=signals]');
    await page.selectOption('#kind','x_person');
    await page.waitForSelector('.card');
    if(await page.locator('.card').count()!==1)throw new Error('人物筛选错误');

    await page.click('nav [data-view=monitor]');
    await page.waitForSelector('.card');
    await page.click('nav [data-view=dashboard]');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'docs/demo-mobile.png',fullPage:true});
    for(const view of ['signals','briefs','saved','monitor','settings']){
      await page.click('#menu');
      await page.click(`nav [data-view=${view}]`);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(view+' 移动端横向溢出');
    }
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('Browser passed: dashboard, collect, detail, save, source form, source toggle/disabled error, public Feed upload, person filter, monitor, six mobile views');
  }finally{
    await browser.close();
    await new Promise(r=>server.close(r));
    store.db.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
