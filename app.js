const bankById = Object.fromEntries(questionBank.map(q => [q.id, q]));
const labels = ['非常不符合','比较不符合','说不清 / 一半一半','比较符合','非常符合'];
let modeKey = 'standard';
let current = 0;
let history = [];
let answerMap = {};
let nickname = '';
let finished = false;

const $ = (id) => document.getElementById(id);
const home = $('home'), quiz = $('quiz'), results = $('results');
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function getMode(){ return modes[modeKey]; }
function dimensionCap(dim){
  const available = questionBank.reduce((n,q) => n + (q.d === dim ? 1 : 0), 0);
  return Math.min(getMode().max, available);
}
function adjusted(q, raw){ return q.r ? 6 - raw : raw; }
function answeredQuestions(){
  return history.filter(id => answerMap[id] != null).map(id => ({q:bankById[id], raw:answerMap[id]}));
}
function valuesFor(dim){
  return answeredQuestions().filter(x => x.q.d === dim).map(x => adjusted(x.q, x.raw));
}
function polarityFor(dim){
  const items = answeredQuestions().filter(x => x.q.d === dim);
  return {
    direct: items.filter(x => !x.q.r).length,
    reverse: items.filter(x => x.q.r).length
  };
}
function dimensionStats(dim){
  const vals = valuesFor(dim);
  const n = vals.length;
  const cfg = getMode();
  if(!n) return {n:0, mean:null, score:null, sd:null, confidence:0, stable:false, reachedMax:false};
  const mean = vals.reduce((a,b)=>a+b,0)/n;
  const variance = n > 1 ? vals.reduce((s,v)=>s+(v-mean)**2,0)/(n-1) : 4;
  const sd = Math.sqrt(variance);
  const consistency = 1 - clamp(sd / 1.5, 0, 1);
  const countEvidence = clamp(n / cfg.min, 0, 1);
  const polarity = polarityFor(dim);
  const polarityCoverage = polarity.direct > 0 && polarity.reverse > 0 ? 1 : .72;
  const cap = dimensionCap(dim);
  const extraSpan = Math.max(1, cap - cfg.min);
  const extraEvidence = n <= cfg.min ? 0 : clamp((n-cfg.min)/extraSpan,0,1);
  const confidence = clamp(.60*consistency + .25*countEvidence + .10*polarityCoverage + .12*extraEvidence, 0, 1);
  const reachedMax = n >= cap;
  const stable = n >= cfg.min && confidence >= cfg.threshold;
  return {
    n, mean, sd, confidence, stable, reachedMax,
    score: Math.round((mean-1)/4*100)
  };
}
function allStats(){
  return Object.fromEntries(Object.keys(dimensions).map(k => [k, dimensionStats(k)]));
}
function confidenceName(stat){
  if(stat.confidence >= .9) return '很高';
  if(stat.confidence >= .78) return '较高';
  if(stat.confidence >= .62) return '中等';
  return '较低';
}
function isResolved(stat){ return stat.stable || stat.reachedMax; }

function renderMini(){
  const stats = allStats();
  $('dimensionMini').innerHTML = Object.entries(dimensions).map(([k,d]) => {
    const s = stats[k];
    const status = s.stable ? '已稳定' : s.reachedMax ? '已完成' : `${s.n}/${getMode().min}+`;
    return `<div class="${isResolved(s)?'resolved':''}"><span>${d.short}</span><span>${status}</span></div>`;
  }).join('');
}

function modeCards(){
  document.querySelectorAll('input[name="quizMode"]').forEach(input => {
    input.addEventListener('change', () => {
      modeKey = input.value;
      document.querySelectorAll('.mode-card').forEach(card => card.classList.toggle('active', card.dataset.mode === modeKey));
      $('modeEstimate').textContent = `${modes[modeKey].estimate}。${modes[modeKey].note}`;
    });
  });
  const checked = document.querySelector('input[name="quizMode"]:checked');
  if(checked) modeKey = checked.value;
  document.querySelectorAll('.mode-card').forEach(card => card.classList.toggle('active', card.dataset.mode === modeKey));
  $('modeEstimate').textContent = `${modes[modeKey].estimate}。${modes[modeKey].note}`;
}

function unusedFor(dim){
  const used = new Set(history);
  return questionBank.filter(q => q.d === dim && !used.has(q.id));
}
function pickQuestionForDimension(dim){
  let candidates = unusedFor(dim);
  if(!candidates.length) return null;
  const polarity = polarityFor(dim);
  const preferReverse = polarity.reverse < polarity.direct;
  const preferred = candidates.filter(q => Boolean(q.r) === preferReverse);
  if(preferred.length) candidates = preferred;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
function chooseNextDimension(){
  const stats = allStats();
  const cfg = getMode();
  const lastDim = history.length ? bankById[history[history.length-1]].d : null;
  let candidates = Object.keys(dimensions).filter(k => stats[k].n < cfg.min);
  if(candidates.length){
    const minN = Math.min(...candidates.map(k => stats[k].n));
    candidates = candidates.filter(k => stats[k].n === minN);
  } else {
    candidates = Object.keys(dimensions).filter(k => !isResolved(stats[k]) && stats[k].n < dimensionCap(k) && unusedFor(k).length > 0);
    if(!candidates.length) return null;
    const minConf = Math.min(...candidates.map(k => stats[k].confidence));
    candidates = candidates.filter(k => stats[k].confidence <= minConf + .06);
  }
  const notRepeat = candidates.filter(k => k !== lastDim);
  if(notRepeat.length) candidates = notRepeat;
  candidates.sort((a,b) => stats[a].n - stats[b].n || stats[a].confidence - stats[b].confidence);
  const shortlist = candidates.slice(0, Math.min(3,candidates.length));
  return shortlist[Math.floor(Math.random()*shortlist.length)];
}
function appendAdaptiveQuestion(){
  const dim = chooseNextDimension();
  if(!dim) return false;
  const q = pickQuestionForDimension(dim);
  if(!q) return false;
  history.push(q.id);
  return true;
}

function renderQuestion(){
  const id = history[current];
  const q = bankById[id];
  if(!q) return;
  const stat = dimensionStats(q.d);
  $('qIndex').textContent = `第 ${current + 1} 题 · ${getMode().name}`;
  $('qDimension').textContent = `${dimensions[q.d].name} · 当前置信度 ${Math.round(stat.confidence*100)}%`;
  $('questionText').textContent = q.t;
  $('questionHint').textContent = '请按最近三个月里通常发生的情况作答，而不是按理想中的自己。';
  $('options').innerHTML = labels.map((label, i) => {
    const v = i + 1;
    return `<button class="option ${answerMap[id] === v ? 'selected':''}" data-value="${v}" aria-pressed="${answerMap[id] === v}"><strong>${v}</strong><span>${label}</span></button>`;
  }).join('');
  document.querySelectorAll('.option').forEach(btn => btn.addEventListener('click', () => {
    answerMap[id] = Number(btn.dataset.value);
    saveDraft();
    renderQuestion();
    updateProgress();
    if(window.innerWidth > 620) setTimeout(() => next(), 120);
  }));
  $('prevBtn').disabled = current === 0;
  $('prevBtn').style.opacity = current === 0 ? .45 : 1;
  $('nextBtn').textContent = current < history.length-1 ? '下一题' : '继续';
  renderMini();
}

function remainingRange(){
  const stats = allStats();
  const cfg = getMode();
  let min = 0, max = 0;
  Object.keys(dimensions).forEach(k => {
    const s = stats[k];
    if(isResolved(s)) return;
    if(s.n < cfg.min) min += cfg.min - s.n;
    else min += 1;
    max += dimensionCap(k) - s.n;
  });
  return {min,max};
}
function updateProgress(){
  const stats = allStats();
  const cfg = getMode();
  const parts = Object.keys(dimensions).map(k => {
    const s = stats[k];
    if(isResolved(s)) return 1;
    if(s.n < cfg.min) return .65 * s.n / cfg.min;
    return .65 + .35 * clamp(s.confidence/cfg.threshold,0,.98);
  });
  const pct = Math.round(parts.reduce((a,b)=>a+b,0)/parts.length*100);
  $('progressNum').textContent = `${pct}%`;
  const circumference = 326.73;
  $('progressCircle').style.strokeDashoffset = circumference * (1 - pct / 100);
  const answered = Object.keys(answerMap).filter(id => answerMap[id] != null).length;
  const remain = remainingRange();
  const note = remain.max === 0 ? `已完成 ${answered} 题` : `已答 ${answered} 题，预计还需 ${remain.min}–${remain.max} 题`;
  $('adaptiveNote').textContent = note;
  renderMini();
}

function next(){
  const id = history[current];
  if(answerMap[id] == null) return toast('请先选择一个答案');
  if(current < history.length - 1){
    current++;
    renderQuestion();
    updateProgress();
    return;
  }
  if(appendAdaptiveQuestion()){
    current++;
    renderQuestion();
    updateProgress();
    saveDraft();
  } else finish();
}
function prev(){
  if(current > 0){
    current--;
    renderQuestion();
    updateProgress();
  }
}

function saveDraft(){
  localStorage.setItem('interactionModelAdaptiveDraftV2', JSON.stringify({
    modeKey, current, history, answerMap, nickname, finished:false
  }));
}
function loadDraft(){
  try {
    const d = JSON.parse(localStorage.getItem('interactionModelAdaptiveDraftV2') || 'null');
    if(d && modes[d.modeKey] && Array.isArray(d.history) && d.history.every(id => bankById[id])){
      modeKey = d.modeKey;
      current = clamp(Number(d.current)||0,0,Math.max(0,d.history.length-1));
      history = d.history;
      answerMap = d.answerMap || {};
      nickname = d.nickname || '';
      $('nickname').value = nickname;
      const radio = document.querySelector(`input[name="quizMode"][value="${modeKey}"]`);
      if(radio) radio.checked = true;
    }
  } catch(e){}
}

