'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_FILE = path.join(process.cwd(), 'data.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

const seed = {
  articles: [
    {id:'a1', slug:'fact-in-the-age-of-speed', title:'빠르게 변하는 시대, 다시 ‘사실’의 무게를 묻다', subtitle:'정보는 넘치지만 믿을 만한 사실은 오히려 찾기 어려워졌다', summary:'새벽신문은 속도보다 정확성, 자극보다 맥락을 선택합니다.', body:'뉴스의 속도는 빨라졌지만 독자가 판단에 쓸 수 있는 맥락은 오히려 줄어들었습니다. 새벽신문은 기사 한 줄의 출처와 숫자 하나의 근거를 확인하는 일을 편집의 출발점으로 삼습니다.\n\n우리는 누가 먼저 썼는가보다 무엇이 사실인가를 더 중요하게 여깁니다. 속보가 필요할 때는 빠르게 전하되, 확인되지 않은 추정과 단정은 구분해 표시합니다.', category:'종합', author:'편집국', image:'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1600&q=85', featured:true, status:'published', createdAt:'2026-08-27T07:00:00.000Z'},
    {id:'a2', slug:'politics-and-daily-life', title:'정국의 다음 분기점…여야, 민생입법 놓고 재격돌', subtitle:'정책 경쟁은 결국 시민의 삶에서 평가받는다', summary:'여야가 주요 민생법안을 둘러싸고 다시 충돌하고 있습니다.', body:'국회가 주요 민생법안 처리 일정을 놓고 협상에 들어갔습니다. 새벽신문은 정쟁의 언어보다 정책이 실제 가계와 지역사회에 어떤 변화를 만드는지에 초점을 맞춰 후속 보도를 이어갑니다.', category:'정치', author:'정치부', image:'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1400&q=80', featured:true, status:'published', createdAt:'2026-08-27T06:00:00.000Z'},
    {id:'a3', slug:'economy-three-variables', title:'금리·환율·수출, 한국경제의 세 갈래 변수', subtitle:'체감경기 회복 여부가 관건', summary:'시장 지표와 생활경제 사이의 간극을 짚습니다.', body:'금리와 환율, 수출 흐름은 서로 분리된 변수가 아닙니다. 기업 투자와 가계 소비, 수입물가까지 연결됩니다.', category:'경제', author:'경제부', image:'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1400&q=80', featured:false, status:'published', createdAt:'2026-08-27T05:00:00.000Z'},
    {id:'a4', slug:'temple-and-modern-life', title:'천년고찰에서 묻다…“지금 이 순간 어떻게 살 것인가”', subtitle:'전통 수행과 현대인의 삶을 잇는 새로운 시도', summary:'불교가 오늘의 불안과 관계 맺는 방식을 현장에서 살펴봅니다.', body:'산사에서 만난 청년들은 거창한 해답보다 자신의 마음을 관찰하는 시간을 필요로 했습니다. 전통은 시대의 언어로 다시 설명되고 경험될 때 다음 세대의 삶과 연결됩니다.', category:'종교·사상', author:'문화종교부', image:'https://images.unsplash.com/photo-1606298855672-3efb63017be8?auto=format&fit=crop&w=1400&q=80', featured:true, status:'published', createdAt:'2026-08-27T04:00:00.000Z'}
  ],
  tips: [],
  subscribers: []
};

let state = JSON.parse(JSON.stringify(seed));
const clone = x => JSON.parse(JSON.stringify(x));
const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const slugify = s => String(s).trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || crypto.randomBytes(4).toString('hex');
const fmtDate = d => new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(d));

function localRead(){ try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch { return null; } }
function localWrite(data){ try { fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2)); } catch(e){ console.error('local save failed', e.message); } }
function sbHeaders(extra={}){ return {'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',...extra}; }

async function supabaseRead(){
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_state?id=eq.main&select=data`, {headers: sbHeaders()});
  if(!r.ok) throw new Error(`Supabase read ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0]?.data || null;
}
async function supabaseWrite(data){
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_state?on_conflict=id`, {
    method:'POST', headers: sbHeaders({'Prefer':'resolution=merge-duplicates,return=minimal'}),
    body: JSON.stringify([{id:'main', data, updated_at:new Date().toISOString()}])
  });
  if(!r.ok) throw new Error(`Supabase write ${r.status}: ${await r.text()}`);
}
async function initData(){
  const local = localRead();
  if(local) state = local;
  if(!USE_SUPABASE){ if(!local) localWrite(state); console.log('Persistence: local fallback'); return; }
  try {
    const remote = await supabaseRead();
    if(remote){ state = remote; localWrite(state); }
    else { await supabaseWrite(state); }
    console.log('Persistence: Supabase connected');
  } catch(e){ console.error('Supabase init failed; using local fallback:', e.message); }
}
function loadData(){ return clone(state); }
async function saveData(data){
  state = clone(data); localWrite(state);
  if(USE_SUPABASE){ await supabaseWrite(state); }
}

function parseCookies(req){ return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>{const i=v.indexOf('='); return [v.slice(0,i).trim(), decodeURIComponent(v.slice(i+1))]})); }
function sign(v){ return crypto.createHmac('sha256',SESSION_SECRET).update(v).digest('hex'); }
function sessionCookie(){ const v='admin'; return `${v}.${sign(v)}`; }
function loggedIn(req){
  const c=parseCookies(req).sb_session; if(!c) return false;
  const [v,s='']=c.split('.'); const a=Buffer.from(sign(v)), b=Buffer.from(s);
  return v==='admin' && a.length===b.length && crypto.timingSafeEqual(a,b);
}
function body(req){ return new Promise((resolve,reject)=>{let d=''; req.on('data',c=>{d+=c;if(d.length>2e6){reject(new Error('too large'));req.destroy();}}); req.on('end',()=>{const ct=req.headers['content-type']||''; if(ct.includes('application/json')){try{return resolve(JSON.parse(d||'{}'))}catch{return resolve({})}} resolve(Object.fromEntries(new URLSearchParams(d)));});}); }
function send(res,code,content,type='text/html; charset=utf-8'){ res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin'}); res.end(content); }
function redirect(res,to){ res.writeHead(302,{Location:to}); res.end(); }

const css=`:root{--red:#a90012;--ink:#111;--line:#ddd}*{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:Arial,'Noto Sans KR',sans-serif}a{color:inherit;text-decoration:none}img{display:block;width:100%;object-fit:cover}.wrap{width:min(1180px,calc(100% - 32px));margin:auto}.top{border-bottom:1px solid #eee;background:#fafafa;color:#666;font-size:12px}.top .wrap{height:34px;display:flex;align-items:center;justify-content:space-between}.mast{height:105px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}.brand{font-family:Georgia,serif;font-size:39px;font-weight:900;letter-spacing:-2px;display:flex;gap:12px;align-items:center}.mark{width:42px;height:42px;background:#111;color:#fff;display:grid;place-items:center}.actions{text-align:right}.nav{border-top:1px solid #111;border-bottom:1px solid var(--line)}.nav .wrap{display:flex;justify-content:center;gap:28px;overflow:auto;white-space:nowrap}.nav a{padding:14px 0;font-weight:700}.breaking{border-bottom:1px solid #ddd;background:#fafafa}.breaking .wrap{height:46px;display:flex;align-items:center;gap:14px}.badge,.kicker{color:var(--red);font-weight:800}.badge{background:var(--red);color:#fff;padding:4px 8px;font-size:12px}.hero{display:grid;grid-template-columns:1.6fr 1fr;gap:36px;padding:40px 0;border-bottom:2px solid #111}.lead{display:grid;grid-template-columns:1.15fr 1fr;gap:26px}.lead img{height:410px}.lead h1,.article h1,.card h3,.side h2,.section-head h2{font-family:Georgia,serif}.lead h1{font-size:38px;line-height:1.28;margin:12px 0}.lead p,.card p{color:#666;line-height:1.7}.side article{padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid #ddd}.side img{height:145px}.side h2{font-size:20px;line-height:1.45}.section{padding:40px 0;border-bottom:1px solid #ccc}.section-head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:22px}.section-head h2{margin:0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.card img{height:210px}.card h3{font-size:21px;line-height:1.45}.article{max-width:820px;margin:42px auto}.article h1{font-size:44px;line-height:1.25}.deck{font-size:20px;color:#555;line-height:1.6}.meta,.small{font-size:12px;color:#777}.article>img{height:460px;margin:28px 0}.body{font-family:Georgia,serif;font-size:19px;line-height:2;white-space:pre-line}.footer{background:#f2f1ed;margin-top:50px;padding:35px 0;color:#666}.formbox{max-width:820px;margin:42px auto;background:#f7f7f5;padding:28px;border:1px solid #ddd}.field{margin-bottom:15px}.field label{display:block;font-weight:700;margin-bottom:6px}.field input,.field textarea,.field select{width:100%;padding:11px;border:1px solid #bbb;font:inherit}.field textarea{min-height:180px}.btn{display:inline-block;border:0;background:#111;color:white;padding:11px 18px;font-weight:700;cursor:pointer}.btn.red{background:var(--red)}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}.adminbar{background:#111;color:#fff;padding:9px 0}.adminbar .wrap{display:flex;justify-content:space-between}.search{display:flex;gap:8px}.search input{padding:8px;border:1px solid #aaa}.newsletter{display:flex;justify-content:space-between;gap:30px;align-items:center;background:#111;color:#fff;padding:28px;margin-top:38px}.newsletter form{display:flex;min-width:380px}.newsletter input{flex:1;padding:12px;border:0}.newsletter button{border:0;background:var(--red);color:#fff;font-weight:800;padding:0 18px}.status{padding:9px 12px;background:#eef7ee;border:1px solid #bad8ba;margin-bottom:18px}.warning{padding:9px 12px;background:#fff4d6;border:1px solid #ead49b;margin-bottom:18px}@media(max-width:800px){.mast{height:78px}.brand{font-size:29px}.hero,.lead{grid-template-columns:1fr}.lead img{height:270px}.lead h1{font-size:31px}.cards{grid-template-columns:1fr}.article h1{font-size:34px}.article>img{height:280px}.newsletter{flex-direction:column;align-items:stretch}.newsletter form{min-width:0}.nav .wrap{justify-content:flex-start}}`;

const cats=['종합','정치','경제','사회','국제','문화','종교·사상','오피니언'];
function layout(title,content,req){ const admin=loggedIn(req); return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | 새벽신문</title><meta name="description" content="사실을 깊게, 세상을 바르게. 새벽신문"><style>${css}</style></head><body>${admin?`<div class="adminbar"><div class="wrap"><b>새벽신문 편집국</b><span><a href="/admin">관리</a> · <a href="/logout">로그아웃</a></span></div></div>`:''}<div class="top"><div class="wrap"><span>${new Intl.DateTimeFormat('ko-KR',{dateStyle:'full',timeZone:'Asia/Seoul'}).format(new Date())}</span><span><a href="/tip">제보</a> · <a href="/admin">편집국</a></span></div></div><header><div class="wrap mast"><span></span><a class="brand" href="/"><span class="mark">晨</span>새벽신문</a><div class="actions"><form class="search" action="/search"><input name="q" placeholder="기사 검색"><button class="btn">검색</button></form></div></div><nav class="nav"><div class="wrap">${cats.map(c=>`<a href="/section/${encodeURIComponent(c)}">${c}</a>`).join('')}</div></nav></header>${content}<footer class="footer"><div class="wrap"><b>새벽신문</b><p>사실을 깊게, 세상을 바르게.</p><p class="small">기사제보 · 독자구독 · 독립 디지털 뉴스룸</p></div></footer></body></html>`; }
function published(d){ return d.articles.filter(a=>a.status==='published').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); }
function card(a){ return `<article class="card"><a href="/article/${esc(a.slug)}"><img src="${esc(a.image||'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80')}" alt=""><span class="kicker">${esc(a.category)}</span><h3>${esc(a.title)}</h3><p>${esc(a.summary||'')}</p></a></article>`; }
function home(req){ const d=loadData(), arts=published(d), lead=arts.find(a=>a.featured)||arts[0], rest=arts.filter(a=>a.id!==lead?.id); return layout('홈',`<div class="breaking"><div class="wrap"><span class="badge">속보</span><span>새벽신문은 사실과 맥락을 함께 전합니다.</span></div></div><main class="wrap">${lead?`<section class="hero"><article class="lead"><a href="/article/${esc(lead.slug)}"><img src="${esc(lead.image)}" alt=""></a><div><span class="kicker">오늘의 주요뉴스</span><h1><a href="/article/${esc(lead.slug)}">${esc(lead.title)}</a></h1><p>${esc(lead.summary)}</p><div class="meta">${esc(lead.author)} · ${fmtDate(lead.createdAt)}</div></div></article><div class="side">${rest.slice(0,2).map(a=>`<article><a href="/article/${esc(a.slug)}"><img src="${esc(a.image)}" alt=""><span class="kicker">${esc(a.category)}</span><h2>${esc(a.title)}</h2></a></article>`).join('')}</div></section>`:''}<section class="section"><div class="section-head"><h2>최신기사</h2></div><div class="cards">${rest.slice(0,6).map(card).join('')}</div></section><section class="newsletter"><div><b>NEWSLETTER</b><h2>아침에 꼭 알아야 할 뉴스만</h2></div><form method="post" action="/subscribe"><input type="email" name="email" placeholder="이메일 주소" required><button>무료 구독</button></form></section></main>`,req); }
function articlePage(req,slug){ const a=published(loadData()).find(x=>x.slug===decodeURIComponent(slug)); if(!a)return null; return layout(a.title,`<main class="wrap"><article class="article"><span class="kicker">${esc(a.category)}</span><h1>${esc(a.title)}</h1><div class="deck">${esc(a.subtitle)}</div><div class="meta">${esc(a.author)} · ${fmtDate(a.createdAt)}</div>${a.image?`<img src="${esc(a.image)}" alt="">`:''}<div class="body">${esc(a.body)}</div></article></main>`,req); }
function sectionPage(req,cat){ const c=decodeURIComponent(cat), arr=published(loadData()).filter(a=>a.category===c); return layout(c,`<main class="wrap section"><div class="section-head"><h2>${esc(c)}</h2></div><div class="cards">${arr.map(card).join('')||'<p>아직 기사가 없습니다.</p>'}</div></main>`,req); }
function searchPage(req,q){ q=String(q||'').trim(); const arr=published(loadData()).filter(a=>(a.title+' '+a.subtitle+' '+a.summary+' '+a.body).toLowerCase().includes(q.toLowerCase())); return layout('검색',`<main class="wrap section"><div class="section-head"><h2>검색: ${esc(q)}</h2></div><div class="cards">${arr.map(card).join('')||'<p>검색 결과가 없습니다.</p>'}</div></main>`,req); }
function tipPage(req,msg=''){ return layout('기사제보',`<main class="wrap"><div class="formbox"><h1>기사제보</h1>${msg?`<div class="status">${esc(msg)}</div>`:''}<p>취재가 필요한 사실과 현장의 목소리를 보내주세요.</p><form method="post"><div class="field"><label>이름</label><input name="name"></div><div class="field"><label>이메일</label><input type="email" name="email"></div><div class="field"><label>제목</label><input name="title" required></div><div class="field"><label>내용</label><textarea name="message" required></textarea></div><button class="btn red">제보 보내기</button></form></div></main>`,req); }
function loginPage(req,msg=''){ return layout('편집국 로그인',`<main class="wrap"><div class="formbox"><h1>편집국 로그인</h1>${msg?`<div class="warning">${esc(msg)}</div>`:''}<form method="post" action="/admin/login"><div class="field"><label>관리자 비밀번호</label><input type="password" name="password" required></div><button class="btn">로그인</button></form></div></main>`,req); }
function adminPage(req){ if(!loggedIn(req))return loginPage(req); const d=loadData(); return layout('편집국',`<main class="wrap section"><div class="section-head"><h2>편집국 CMS</h2><a class="btn" href="/admin/new">새 기사</a></div><div class="${USE_SUPABASE?'status':'warning'}">저장방식: ${USE_SUPABASE?'Supabase 영구 DB':'Render 임시 저장소(연결 준비 중)'}</div><p>기사 ${d.articles.length}건 · 구독자 ${d.subscribers.length}명 · 제보 ${d.tips.length}건</p><table class="table"><thead><tr><th>상태</th><th>섹션</th><th>제목</th><th>기자</th><th>관리</th></tr></thead><tbody>${d.articles.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(a=>`<tr><td>${esc(a.status)}</td><td>${esc(a.category)}</td><td>${esc(a.title)}</td><td>${esc(a.author)}</td><td><a href="/admin/edit/${a.id}">수정</a> · <form style="display:inline" method="post" action="/admin/delete/${a.id}" onsubmit="return confirm('삭제할까요?')"><button style="border:0;background:none;color:#a90012;cursor:pointer">삭제</button></form></td></tr>`).join('')}</tbody></table><p><a href="/admin/export">데이터 백업(JSON) 다운로드</a></p></main>`,req); }
function articleForm(req,a={}){ const editing=Boolean(a.id); return layout(editing?'기사 수정':'새 기사',`<main class="wrap"><div class="formbox"><h1>${editing?'기사 수정':'새 기사'}</h1><form method="post" action="${editing?`/admin/edit/${a.id}`:'/admin/new'}"><div class="field"><label>제목</label><input name="title" value="${esc(a.title||'')}" required></div><div class="field"><label>부제</label><input name="subtitle" value="${esc(a.subtitle||'')}"></div><div class="field"><label>요약</label><textarea name="summary">${esc(a.summary||'')}</textarea></div><div class="field"><label>본문</label><textarea name="body" required>${esc(a.body||'')}</textarea></div><div class="field"><label>섹션</label><select name="category">${cats.map(c=>`<option ${a.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label>기자명</label><input name="author" value="${esc(a.author||'편집국')}"></div><div class="field"><label>대표사진 URL</label><input name="image" value="${esc(a.image||'')}" placeholder="https://..."></div><div class="field"><label>상태</label><select name="status"><option value="draft" ${a.status==='draft'?'selected':''}>초안</option><option value="published" ${a.status==='published'||!a.status?'selected':''}>발행</option></select></div><div class="field"><label><input type="checkbox" name="featured" value="true" ${a.featured?'checked':''}> 주요기사로 표시</label></div><button class="btn red">저장</button></form></div></main>`,req); }

const server=http.createServer(async(req,res)=>{ try{
  const u=new URL(req.url, SITE_URL), p=u.pathname;
  if(req.method==='GET'&&p==='/health') return send(res,200,JSON.stringify({ok:true,persistence:USE_SUPABASE?'supabase':'local'}),'application/json');
  if(req.method==='GET'&&p==='/') return send(res,200,home(req));
  if(req.method==='GET'&&p.startsWith('/article/')){const page=articlePage(req,p.slice(9));return page?send(res,200,page):send(res,404,layout('404','<main class="wrap section"><h1>기사를 찾을 수 없습니다.</h1></main>',req));}
  if(req.method==='GET'&&p.startsWith('/section/')) return send(res,200,sectionPage(req,p.slice(9)));
  if(req.method==='GET'&&p==='/search') return send(res,200,searchPage(req,u.searchParams.get('q')||''));
  if(req.method==='GET'&&p==='/tip') return send(res,200,tipPage(req));
  if(req.method==='POST'&&p==='/tip'){const b=await body(req),d=loadData();d.tips.push({id:crypto.randomUUID(),name:b.name||'',email:b.email||'',title:b.title||'',message:b.message||'',createdAt:new Date().toISOString()});await saveData(d);return send(res,200,tipPage(req,'제보가 접수되었습니다. 편집국에서 확인하겠습니다.'));}
  if(req.method==='POST'&&p==='/subscribe'){const b=await body(req),d=loadData(),email=String(b.email||'').trim().toLowerCase();if(email&&!d.subscribers.some(x=>x.email===email))d.subscribers.push({email,createdAt:new Date().toISOString()});await saveData(d);return redirect(res,'/');}
  if(req.method==='GET'&&p==='/admin') return send(res,200,adminPage(req));
  if(req.method==='POST'&&p==='/admin/login'){const b=await body(req);if(b.password!==ADMIN_PASSWORD)return send(res,401,loginPage(req,'비밀번호가 올바르지 않습니다.'));res.writeHead(302,{Location:'/admin','Set-Cookie':`sb_session=${encodeURIComponent(sessionCookie())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`});return res.end();}
  if(req.method==='GET'&&p==='/logout'){res.writeHead(302,{Location:'/','Set-Cookie':'sb_session=; Path=/; Max-Age=0'});return res.end();}
  if(p.startsWith('/admin/')&&!loggedIn(req)) return redirect(res,'/admin');
  if(req.method==='GET'&&p==='/admin/new') return send(res,200,articleForm(req));
  if(req.method==='POST'&&p==='/admin/new'){const b=await body(req),d=loadData(),articleId=crypto.randomUUID();d.articles.push({id:articleId,slug:slugify(b.title)+'-'+articleId.slice(0,6),title:b.title||'',subtitle:b.subtitle||'',summary:b.summary||'',body:b.body||'',category:b.category||'종합',author:b.author||'편집국',image:b.image||'',featured:b.featured==='true',status:b.status||'draft',createdAt:new Date().toISOString()});await saveData(d);return redirect(res,'/admin');}
  if(req.method==='GET'&&p.startsWith('/admin/edit/')){const articleId=p.slice(12),a=loadData().articles.find(x=>x.id===articleId);return a?send(res,200,articleForm(req,a)):send(res,404,'Not found');}
  if(req.method==='POST'&&p.startsWith('/admin/edit/')){const articleId=p.slice(12),b=await body(req),d=loadData(),a=d.articles.find(x=>x.id===articleId);if(!a)return send(res,404,'Not found');Object.assign(a,{title:b.title||'',subtitle:b.subtitle||'',summary:b.summary||'',body:b.body||'',category:b.category||'종합',author:b.author||'편집국',image:b.image||'',featured:b.featured==='true',status:b.status||'draft',updatedAt:new Date().toISOString()});await saveData(d);return redirect(res,'/admin');}
  if(req.method==='POST'&&p.startsWith('/admin/delete/')){const articleId=p.slice(14),d=loadData();d.articles=d.articles.filter(x=>x.id!==articleId);await saveData(d);return redirect(res,'/admin');}
  if(req.method==='GET'&&p==='/admin/export') return send(res,200,JSON.stringify(loadData(),null,2),'application/json; charset=utf-8');
  if(req.method==='GET'&&p==='/rss.xml'){const arts=published(loadData()).slice(0,20);const feed=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>새벽신문</title><link>${esc(SITE_URL)}</link><description>사실을 깊게, 세상을 바르게.</description>${arts.map(a=>`<item><title>${esc(a.title)}</title><link>${SITE_URL}/article/${esc(a.slug)}</link><pubDate>${new Date(a.createdAt).toUTCString()}</pubDate><description>${esc(a.summary)}</description></item>`).join('')}</channel></rss>`;return send(res,200,feed,'application/rss+xml; charset=utf-8');}
  return send(res,404,layout('404','<main class="wrap section"><h1>페이지를 찾을 수 없습니다.</h1></main>',req));
 }catch(e){console.error(e);return send(res,500,'Internal Server Error','text/plain; charset=utf-8');}});

initData().finally(()=>server.listen(PORT,'0.0.0.0',()=>console.log(`Saebyeok News listening on ${PORT}`)));
