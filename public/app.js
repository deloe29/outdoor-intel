const tabs=['All','Elk','Whitetail','Mule Deer','Big Game','Wolves & Predators','Fishing','Conservation','Regulations','Research'];
let active='All', stories=[], clusters=[], snapshot={};
const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago=d=>{const m=Math.floor((Date.now()-new Date(d))/60000);if(m<60)return `${Math.max(1,m)}m ago`;const h=Math.floor(m/60);if(h<24)return `${h}h ago`;const days=Math.floor(h/24);if(days<30)return `${days}d ago`;return `${Math.floor(days/30)}mo ago`};

function renderTabs(){
  $('#tabs').innerHTML=tabs.map(t=>`<button class="${t===active?'active':''}" data-tab="${t}">${t}</button>`).join('');
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{active=b.dataset.tab;renderTabs();render();});
}
function inWindow(item,v){if(v==='all')return true;return Date.now()-new Date(item.publishedAt).getTime()<=Number(v)*864e5}
function haystack(x){return `${x.title} ${x.summary||x.description||''} ${x.source||''} ${(x.sources||[]).join(' ')} ${(x.tags||[]).join(' ')} ${(x.states||[]).join(' ')}`.toLowerCase()}
function current(){
  const mode=$('#viewMode').value, q=$('#search').value.toLowerCase().trim(), src=$('#sourceFilter').value, state=$('#stateFilter').value, win=$('#timeFilter').value;
  let arr=(mode==='clusters'?clusters:stories).filter(x=>(active==='All'||(x.tags||[]).includes(active))&&(!src||(x.source===src||(x.sources||[]).includes(src)))&&(!state||(x.states||[]).includes(state))&&inWindow(x,win)&&(!q||haystack(x).includes(q)));
  const sort=$('#sort').value;
  if(sort==='new')arr.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
  else if(sort==='relevance')arr.sort((a,b)=>(b.relevance||0)-(a.relevance||0)||new Date(b.publishedAt)-new Date(a.publishedAt));
  else arr.sort((a,b)=>(b.clusterScore??b.score??0)-(a.clusterScore??a.score??0)||new Date(b.publishedAt)-new Date(a.publishedAt));
  return arr;
}
function pills(x){return [...(x.states||[]).slice(0,2).map(t=>`<span class="tag state-tag">${esc(t)}</span>`),...(x.tags||[]).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`)].join('')}
function scoreLabel(x){const sort=$('#sort').value;if(sort==='top')return `Top ${x.clusterScore??x.score??0}`;return `Rel ${x.relevance||0}`}
function sourcesBlock(x){
  if(!x.articles||x.articles.length<2)return '';
  const items=x.articles.slice().sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).map(a=>`<a class="coverage-item" href="${a.link}" target="_blank" rel="noopener"><span>${esc(a.source)}</span><small>${ago(a.publishedAt)}</small><strong>${esc(a.title)}</strong></a>`).join('');
  return `<details class="coverage"><summary>${x.sourceCount} sources covering this event</summary><div>${items}</div></details>`;
}
function meta(x){const multi=(x.sourceCount||1)>1?`<span class="multi">${x.sourceCount} SOURCES</span>`:'';return `<div class="meta"><span class="source">${esc(x.source)}</span><span>${ago(x.publishedAt)}</span>${multi}<span class="score">${scoreLabel(x)}</span></div>`}
function card(x,rank,lead=false){
  const summary=esc(x.summary||x.description||''); const care=esc(x.whyCare||'');
  if(lead)return `<article class="lead-card">${meta(x)}<h3><a href="${x.link}" target="_blank" rel="noopener">${esc(x.title)}</a></h3><div class="summary">${summary}</div><div class="care"><b>WHY HUNTERS SHOULD CARE</b><p>${care}</p></div><div class="tagrow">${pills(x)}</div>${sourcesBlock(x)}</article>`;
  return `<article class="story"><div class="rank">${String(rank).padStart(2,'0')}</div><div>${meta(x)}<h3><a href="${x.link}" target="_blank" rel="noopener">${esc(x.title)}</a></h3><p>${summary}</p><div class="care compact"><b>WHY IT MATTERS</b><p>${care}</p></div><div class="tagrow">${pills(x)}</div>${sourcesBlock(x)}</div></article>`;
}
function renderList(id,arr){
  $(id).innerHTML=(arr||[]).length?(arr||[]).map(x=>`<a href="${x.link}" target="_blank" rel="noopener"><small>${esc((x.states||[])[0]||x.source)} • ${ago(x.publishedAt)}</small><span>${esc(x.title)}</span></a>`).join(''):'<span class="muted">No recent signals.</span>';
}
function render(){
  const arr=current(), state=$('#stateFilter').value, mode=$('#viewMode').value;
  $('#feedTitle').textContent=state?`${state} • ${active==='All'?'All Outdoor':active}`:(active==='All'?'Latest intelligence':active);
  $('#resultCount').textContent=`${arr.length} ${mode==='clusters'?'events':'stories'}`;
  $('#lead').innerHTML=arr[0]?card(arr[0],1,true):'<div class="empty">No stories match these filters.</div>';
  $('#stories').innerHTML=arr.slice(1).map((x,i)=>card(x,i+2)).join('');
  const counts={};arr.forEach(x=>(x.tags||[]).forEach(t=>counts[t]=(counts[t]||0)+1));
  $('#trends').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,n])=>`<span class="trend">${esc(t)} <b>${n}</b></span>`).join('');
}
function fillFilters(){
  const ps=$('#sourceFilter').value,pst=$('#stateFilter').value;
  const sources=[...new Set(stories.map(x=>x.source))].sort();
  $('#sourceFilter').innerHTML='<option value="">All sources</option>'+sources.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if(sources.includes(ps))$('#sourceFilter').value=ps;
  const states=[...new Set(stories.flatMap(x=>x.states||[]))].sort();
  $('#stateFilter').innerHTML='<option value="">All states</option>'+states.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if(states.includes(pst))$('#stateFilter').value=pst;
}
function renderSnapshot(){
  $('#signal7').textContent=snapshot.last7Days??0;$('#multiSource').textContent=snapshot.multiSourceClusters??0;$('#regAlerts').textContent=snapshot.regulationAlerts??0;$('#researchSignals').textContent=snapshot.researchSignals??0;$('#predatorSignals').textContent=snapshot.predatorSignals??0;
  const max=Math.max(1,...(snapshot.topStates||[]).map(x=>x.count));
  $('#statePulse').innerHTML=(snapshot.topStates||[]).map(x=>`<button data-statejump="${esc(x.name)}"><span>${esc(x.name)}</span><i><em style="width:${Math.round(x.count/max*100)}%"></em></i><b>${x.count}</b></button>`).join('')||'<span class="muted">No state signals yet.</span>';
  document.querySelectorAll('[data-statejump]').forEach(b=>b.onclick=()=>{$('#stateFilter').value=b.dataset.statejump;render()});
  renderList('#regulationList',snapshot.latestRegulations);renderList('#researchList',snapshot.latestResearch);
}
async function load(force=false){
  $('#status').innerHTML='<i></i> Refreshing live intel';$('#refresh').disabled=true;
  try{const r=await fetch('/api/stories'+(force?'?refresh=1':''));if(!r.ok)throw new Error('feed');const j=await r.json();stories=j.stories||[];clusters=j.clusters||[];snapshot=j.snapshot||{};
    $('#storyCount').textContent=stories.length;$('#clusterCount').textContent=clusters.length;$('#sourceCount').textContent=j.sourceCount;$('#lastUpdated').textContent=new Date(j.refreshedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    $('#status').innerHTML=`<i></i> Live • ${stories.length} stories • ${clusters.length} events • ${j.feedErrors||0} feed errors`;
    fillFilters();renderSnapshot();render();
  }catch(e){$('#status').textContent='Feed unavailable';$('#lead').innerHTML='<div class="empty">Could not load live feeds. Check your internet connection, then hit Refresh.</div>'}
  finally{$('#refresh').disabled=false}
}
renderTabs();$('#search').oninput=render;['sourceFilter','stateFilter','timeFilter','sort','viewMode'].forEach(id=>$('#'+id).onchange=render);$('#refresh').onclick=()=>load(true);load();setInterval(()=>load(false),10*60*1000);
