function calculate(){
  const scores = {}, stats = allStats();
  Object.keys(dimensions).forEach(k => {
    scores[k] = stats[k].score == null ? 50 : stats[k].score;
  });
  return {scores, stats};
}
function level(score){ return score >= 76 ? 'high' : score >= 51 ? 'mid' : 'low'; }
function levelName(score){ return score >= 76 ? '较稳定' : score >= 51 ? '发展中' : '需关注'; }

function finish(){
  const unanswered = history.findIndex(id => answerMap[id] == null);
  if(unanswered !== -1){ current = unanswered; renderQuestion(); return toast('还有已出现的题目没有作答'); }
  const {scores, stats} = calculate();
  localStorage.setItem('interactionModelLastResultV2', JSON.stringify({
    scores, stats, history, answerMap, nickname, modeKey, date:new Date().toISOString()
  }));
  localStorage.removeItem('interactionModelAdaptiveDraftV2');
  finished = true;
  quiz.classList.add('hidden'); home.classList.add('hidden'); results.classList.remove('hidden');
  renderResults(scores, stats);
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderResults(scores, stats){
  const displayName = nickname.trim() || '你';
  const answered = Object.keys(answerMap).filter(id => answerMap[id] != null).length;
  $('resultTitle').textContent = `${displayName}的相处模型`;
  $('resultIntro').textContent = `${getMode().name}共使用 ${answered} 道题。系统已停止追问回答较一致的维度，并把更多题目用于置信度较低的维度。`;
  const entries = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const strengths = entries.slice(0,2);
  const growth = [...entries].sort((a,b)=>a[1]-b[1]).slice(0,2);
  const avg = Math.round(entries.reduce((s,[,v])=>s+v,0)/entries.length);
  const avgConf = Math.round(Object.values(stats).reduce((s,v)=>s+v.confidence,0)/Object.keys(stats).length*100);

  let headline = '';
  if(avg >= 78) headline = '整体稳定，具备较成熟的关系维护能力';
  else if(avg >= 58) headline = '基础良好，但不同场景下的稳定性有明显差异';
  else headline = '当前更适合从少量、可验证的行为改变开始';
  $('summaryTitle').textContent = headline;

  const strongNames = strengths.map(([k])=>dimensions[k].name).join('、');
  const growNames = growth.map(([k])=>dimensions[k].name).join('、');
  $('summaryCopy').innerHTML = `<p>你的相对优势集中在 <b>${strongNames}</b>。当前七个维度的平均回答置信度为 <b>${avgConf}%</b>。</p><p>最值得继续观察的是 <b>${growNames}</b>。分数和置信度需要分开看：分数描述倾向方向，置信度只表示本次回答是否足够多且前后一致。</p>`;
  $('tagRow').innerHTML = strengths.map(([k])=>`<span class="tag">优势 · ${dimensions[k].name}</span>`).join('') + growth.map(([k])=>`<span class="tag">观察 · ${dimensions[k].name}</span>`).join('');
  $('scores').innerHTML = Object.entries(dimensions).map(([k,d]) => `<div class="score-row"><span>${d.short}</span><div class="bar"><i style="width:${scores[k]}%"></i></div><b>${scores[k]}</b></div>`).join('');

  $('detailGrid').innerHTML = Object.entries(dimensions).map(([k,d]) => {
    const s = scores[k], l = level(s), st = stats[k];
    return `<article class="dimension-card"><header><h4>${d.name}</h4><span class="score-badge">${s}</span></header><div class="confidence-line"><span>本维度 ${st.n} 题</span><span>置信度 ${Math.round(st.confidence*100)}% · ${confidenceName(st)}</span></div><p><b>${levelName(s)}：</b>${d[l]}</p><p><b>下一步：</b>${d.tip}</p></article>`;
  }).join('');
  $('legendNote').textContent = `雷达图展示倾向分数；各维度置信度见右侧详情。本次共回答 ${answered} 题，题库总量为 ${questionBank.length} 题。`;
  drawRadar(scores);
}

function drawRadar(scores){
  const svg = $('radar');
  const keys = Object.keys(dimensions), n = keys.length;
  const cx = 300, cy = 300, radius = 205;
  const angle = i => -Math.PI/2 + i * Math.PI*2/n;
  const point = (i,r) => [cx + Math.cos(angle(i))*r, cy + Math.sin(angle(i))*r];
  const poly = (r) => keys.map((_,i)=>point(i,r).join(',')).join(' ');
  let html = `<defs><linearGradient id="fillGrad" x1="0" x2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".38"/><stop offset="1" stop-color="var(--primary-2)" stop-opacity=".22"/></linearGradient></defs>`;
  [1,.75,.5,.25].forEach((f,idx)=> html += `<polygon points="${poly(radius*f)}" fill="none" stroke="var(--line)" stroke-width="${idx===0?2:1}"/>`);
  keys.forEach((k,i)=>{
    const [x,y] = point(i,radius);
    html += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`;
  });
  const valuePts = keys.map((k,i)=>point(i,radius*scores[k]/100));
  html += `<polygon points="${valuePts.map(p=>p.join(',')).join(' ')}" fill="url(#fillGrad)" stroke="var(--primary)" stroke-width="4" stroke-linejoin="round"/>`;
  valuePts.forEach(([x,y],i)=> html += `<circle cx="${x}" cy="${y}" r="6" fill="var(--panel-solid)" stroke="var(--primary)" stroke-width="4"><title>${dimensions[keys[i]].name}: ${scores[keys[i]]}</title></circle>`);
  keys.forEach((k,i)=>{
    const [x,y] = point(i,radius+48);
    const anchor = x < cx-20 ? 'end' : x > cx+20 ? 'start' : 'middle';
    const dy = y < cy ? -4 : 12;
    html += `<text x="${x}" y="${y+dy}" text-anchor="${anchor}" fill="var(--text)" font-size="17" font-weight="700">${dimensions[k].short}</text><text x="${x}" y="${y+dy+20}" text-anchor="${anchor}" fill="var(--muted)" font-size="13">${scores[k]}</text>`;
  });
  svg.innerHTML = html;
}

function makeMarkdown(){
  const {scores, stats} = calculate();
  const date = new Date().toLocaleDateString('zh-CN');
  const name = nickname.trim() || '匿名';
  const answered = Object.keys(answerMap).filter(id => answerMap[id] != null).length;
  const entries = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const strengths = entries.slice(0,2).map(([k])=>dimensions[k].name).join('、');
  const growth = [...entries].sort((a,b)=>a[1]-b[1]).slice(0,2).map(([k])=>dimensions[k].name).join('、');
  let md = `# ${name}的相处模型\n\n> 生成日期：${date}\n> 答题模式：${getMode().name}\n> 实际题数：${answered} / 题库 ${questionBank.length}\n> 本结果基于自我报告，只用于反思，不是心理诊断或固定人格标签。\n\n## 一、七维得分与置信度\n\n| 维度 | 得分 | 状态 | 题数 | 置信度 |\n|---|---:|---|---:|---:|\n`;
  Object.entries(dimensions).forEach(([k,d])=> md += `| ${d.name} | ${scores[k]} | ${levelName(scores[k])} | ${stats[k].n} | ${Math.round(stats[k].confidence*100)}% |\n`);
  md += `\n## 二、当前摘要\n\n- 相对优势：${strengths}\n- 优先观察：${growth}\n- 自适应规则：回答较一致的维度提前停止；不一致的维度追加题目，直到达到置信度阈值或题数上限。\n\n## 三、逐维度解释\n\n`;
  Object.entries(dimensions).forEach(([k,d])=>{
    const s=scores[k], l=level(s), st=stats[k];
    md += `### ${d.name}（得分 ${s}；置信度 ${Math.round(st.confidence*100)}%；${st.n} 题）\n\n${d[l]}\n\n**下一步建议：** ${d.tip}\n\n`;
  });
  md += `## 四、更新原则\n\n后续应记录具体事件、当时反应、造成的影响，以及该事件支持或反驳了哪个判断。新证据可以补充，也可以推翻当前结果。\n`;
  return md;
}

function downloadMarkdown(){
  const blob = new Blob([makeMarkdown()], {type:'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${nickname.trim() || '我的'}_相处模型.md`; a.click();
  URL.revokeObjectURL(url); toast('已导出 Markdown');
}
async function copySummary(){
  try { await navigator.clipboard.writeText(makeMarkdown()); toast('结果已复制'); }
  catch(e) { toast('复制失败，请使用导出功能'); }
}
function restart(){
  if(!confirm('确认清空当前答案并重新开始吗？')) return;
  current=0; history=[]; answerMap={}; finished=false;
  localStorage.removeItem('interactionModelAdaptiveDraftV2');
  results.classList.add('hidden'); quiz.classList.add('hidden'); home.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800);
}

$('startBtn').addEventListener('click',()=>{
  nickname = $('nickname').value.trim();
  const selected = document.querySelector('input[name="quizMode"]:checked');
  modeKey = selected ? selected.value : 'standard';
  if(!history.length) appendAdaptiveQuestion();
  home.classList.add('hidden'); results.classList.add('hidden'); quiz.classList.remove('hidden');
  current = clamp(current,0,history.length-1);
  renderQuestion(); updateProgress(); saveDraft(); window.scrollTo({top:0,behavior:'smooth'});
});
$('nextBtn').addEventListener('click', next);
$('prevBtn').addEventListener('click', prev);
$('exportBtn').addEventListener('click', downloadMarkdown);
$('copyBtn').addEventListener('click', copySummary);
$('restartBtn').addEventListener('click', restart);
window.addEventListener('keydown', e=>{
  if(quiz.classList.contains('hidden')) return;
  const id = history[current];
  if(['1','2','3','4','5'].includes(e.key)){
    answerMap[id]=Number(e.key); saveDraft(); renderQuestion(); updateProgress();
  } else if(e.key==='ArrowRight' || e.key==='Enter') next();
  else if(e.key==='ArrowLeft') prev();
});

loadDraft(); modeCards(); renderMini();
