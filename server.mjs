import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const REFRESH_MINUTES = Math.max(5, Number(process.env.REFRESH_MINUTES || 15));
const CACHE_MS = REFRESH_MINUTES * 60 * 1000;
const MAX_INGEST_AGE_DAYS = 365;
const MAX_STORIES = 2500;
const FETCH_CONCURRENCY = 24;

const prioritySources = new Set([
  'Field & Stream','onX Hunt','GOHUNT','Outdoor Life','MeatEater',
  'Rocky Mountain Elk Foundation','National Deer Association','Mule Deer Foundation',
  'Backcountry Hunters & Anglers','Theodore Roosevelt Conservation Partnership',
  'National Wild Turkey Federation','Ducks Unlimited','Pheasants Forever','Trout Unlimited'
]);

// Source-specific discovery feeds. Google News RSS is used as a no-key discovery layer;
// every result links to the original publisher.
const publisherQueries = [
  { name:'Field & Stream', query:'site:fieldandstream.com (hunting OR deer OR elk OR conservation OR fishing OR wildlife) when:365d', forceSource:true },
  { name:'onX Hunt', query:'site:onxmaps.com/hunt (hunting OR elk OR deer OR conservation OR public land OR wildlife) when:365d', forceSource:true },
  { name:'GOHUNT', query:'site:gohunt.com (hunting OR elk OR deer OR conservation OR wildlife OR regulations) when:365d', forceSource:true },
  { name:'Outdoor Life', query:'site:outdoorlife.com (hunting OR elk OR deer OR conservation OR fishing OR wildlife) when:365d', forceSource:true },
  { name:'MeatEater', query:'site:themeateater.com (hunting OR conservation OR deer OR elk OR fishing OR wildlife) when:365d', forceSource:true },
  { name:'Rokslide', query:'site:rokslide.com (hunting OR elk OR mule deer OR gear OR conservation) when:365d', forceSource:true },
  { name:'Western Hunter', query:'site:westernhunter.net (elk OR mule deer OR hunting OR conservation) when:365d', forceSource:true },
  { name:'Eastmans', query:'site:eastmans.com (elk OR mule deer OR hunting OR conservation) when:365d', forceSource:true },
  { name:'Bowhunter', query:'site:bowhunter.com (bowhunting OR elk OR deer OR hunting) when:365d', forceSource:true },
  { name:'Deer & Deer Hunting', query:'site:deeranddeerhunting.com (whitetail OR deer OR hunting OR CWD) when:365d', forceSource:true },
  { name:'National Deer Association', query:'site:deerassociation.com (whitetail OR deer OR CWD OR conservation) when:365d', forceSource:true },
  { name:'Mule Deer Foundation', query:'site:muledeer.org (mule deer OR conservation OR habitat OR migration) when:365d', forceSource:true },
  { name:'Rocky Mountain Elk Foundation', query:'site:rmef.org (elk OR conservation OR habitat OR public land) when:365d', forceSource:true },
  { name:'Backcountry Hunters & Anglers', query:'site:backcountryhunters.org (public lands OR conservation OR hunting OR fishing) when:365d', forceSource:true },
  { name:'Theodore Roosevelt Conservation Partnership', query:'site:trcp.org (hunting OR fishing OR conservation OR public lands OR habitat) when:365d', forceSource:true },
  { name:'National Wild Turkey Federation', query:'site:nwtf.org (hunting OR turkey OR conservation OR habitat) when:365d', forceSource:true },
  { name:'Ducks Unlimited', query:'site:ducks.org (hunting OR waterfowl OR conservation OR habitat) when:365d', forceSource:true },
  { name:'Pheasants Forever', query:'site:pheasantsforever.org (hunting OR upland OR conservation OR habitat) when:365d', forceSource:true },
  { name:'Trout Unlimited', query:'site:tu.org (fishing OR trout OR conservation OR habitat) when:365d', forceSource:true },
  { name:'Hatch Magazine', query:'site:hatchmag.com (fishing OR trout OR conservation) when:365d', forceSource:true },
  { name:'USFWS', query:'site:fws.gov (hunting OR wildlife OR wolves OR elk OR deer OR conservation OR fisheries) when:365d', forceSource:true },
  { name:'USGS', query:'site:usgs.gov (wildlife OR elk OR deer OR wolves OR fisheries OR CWD OR migration) when:365d', forceSource:true },
  { name:'USDA APHIS Wildlife Services', query:'site:aphis.usda.gov (wildlife OR predator OR wolf OR coyote OR disease) when:365d', forceSource:true },
  { name:'BLM', query:'site:blm.gov (wildlife OR hunting OR habitat OR public lands OR migration) when:365d', forceSource:true },
  { name:'U.S. Forest Service', query:'site:fs.usda.gov (wildlife OR hunting OR habitat OR public lands OR fishing) when:365d', forceSource:true },
  { name:'National Park Service', query:'site:nps.gov (elk OR deer OR wolves OR wildlife OR fisheries OR conservation) when:365d', forceSource:true }
];

const stateAgencies = [
  ['Alabama','Alabama Division of Wildlife and Freshwater Fisheries'],
  ['Alaska','Alaska Department of Fish and Game'],
  ['Arizona','Arizona Game and Fish Department'],
  ['Arkansas','Arkansas Game and Fish Commission'],
  ['California','California Department of Fish and Wildlife'],
  ['Colorado','Colorado Parks and Wildlife'],
  ['Connecticut','Connecticut DEEP Bureau of Natural Resources'],
  ['Delaware','Delaware Division of Fish and Wildlife'],
  ['Florida','Florida Fish and Wildlife Conservation Commission'],
  ['Georgia','Georgia Wildlife Resources Division'],
  ['Hawaii','Hawaii Division of Forestry and Wildlife'],
  ['Idaho','Idaho Department of Fish and Game'],
  ['Illinois','Illinois Department of Natural Resources wildlife'],
  ['Indiana','Indiana Division of Fish and Wildlife'],
  ['Iowa','Iowa Department of Natural Resources wildlife'],
  ['Kansas','Kansas Department of Wildlife and Parks'],
  ['Kentucky','Kentucky Department of Fish and Wildlife Resources'],
  ['Louisiana','Louisiana Department of Wildlife and Fisheries'],
  ['Maine','Maine Department of Inland Fisheries and Wildlife'],
  ['Maryland','Maryland Department of Natural Resources wildlife'],
  ['Massachusetts','MassWildlife'],
  ['Michigan','Michigan Department of Natural Resources wildlife'],
  ['Minnesota','Minnesota Division of Fish and Wildlife'],
  ['Mississippi','Mississippi Department of Wildlife Fisheries and Parks'],
  ['Missouri','Missouri Department of Conservation'],
  ['Montana','Montana Fish Wildlife and Parks'],
  ['Nebraska','Nebraska Game and Parks Commission'],
  ['Nevada','Nevada Department of Wildlife'],
  ['New Hampshire','New Hampshire Fish and Game Department'],
  ['New Jersey','New Jersey Fish and Wildlife'],
  ['New Mexico','New Mexico Department of Game and Fish'],
  ['New York','New York DEC fish wildlife'],
  ['North Carolina','North Carolina Wildlife Resources Commission'],
  ['North Dakota','North Dakota Game and Fish Department'],
  ['Ohio','Ohio Division of Wildlife'],
  ['Oklahoma','Oklahoma Department of Wildlife Conservation'],
  ['Oregon','Oregon Department of Fish and Wildlife'],
  ['Pennsylvania','Pennsylvania Game Commission'],
  ['Rhode Island','Rhode Island DEM Division of Fish and Wildlife'],
  ['South Carolina','South Carolina Department of Natural Resources wildlife'],
  ['South Dakota','South Dakota Game Fish and Parks'],
  ['Tennessee','Tennessee Wildlife Resources Agency'],
  ['Texas','Texas Parks and Wildlife Department'],
  ['Utah','Utah Division of Wildlife Resources'],
  ['Vermont','Vermont Fish and Wildlife Department'],
  ['Virginia','Virginia Department of Wildlife Resources'],
  ['Washington','Washington Department of Fish and Wildlife'],
  ['West Virginia','West Virginia Division of Natural Resources wildlife'],
  ['Wisconsin','Wisconsin DNR wildlife'],
  ['Wyoming','Wyoming Game and Fish Department']
].map(([state,name]) => ({
  name,
  stateHint:state,
  query:`\"${name}\" (hunting OR fishing OR deer OR elk OR wildlife OR regulations OR conservation) when:365d`,
  forceSource:false
}));

// A few high-value agency domains get a direct site-scoped feed in addition to the nationwide agency watch.
const directStateQueries = [
  {name:'Colorado Parks & Wildlife',stateHint:'Colorado',query:'site:cpw.state.co.us (elk OR deer OR wolves OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Wyoming Game & Fish',stateHint:'Wyoming',query:'site:wgfd.wyo.gov (elk OR deer OR wolves OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Montana FWP',stateHint:'Montana',query:'site:fwp.mt.gov (elk OR deer OR wolves OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Idaho Fish & Game',stateHint:'Idaho',query:'site:idfg.idaho.gov (elk OR deer OR wolves OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Utah DWR',stateHint:'Utah',query:'site:wildlife.utah.gov (elk OR deer OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Arizona Game & Fish',stateHint:'Arizona',query:'site:azgfd.com (elk OR deer OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'New Mexico Game & Fish',stateHint:'New Mexico',query:'site:wildlife.dgf.nm.gov (elk OR deer OR hunting OR fishing OR regulations) when:365d',forceSource:true},
  {name:'Nevada Department of Wildlife',stateHint:'Nevada',query:'site:ndow.org (elk OR deer OR hunting OR fishing OR regulations) when:365d',forceSource:true}
];

const broadQueries = [
  {name:'Big Game Wire',query:'(elk OR whitetail OR "mule deer" OR pronghorn OR moose OR caribou OR bighorn) (hunting OR wildlife OR conservation) when:365d'},
  {name:'Predator Wire',query:'(wolf OR wolves OR coyote OR cougar OR "mountain lion" OR grizzly OR predator) (wildlife management OR hunting OR conservation) when:365d'},
  {name:'Fishing Wire',query:'(fishing OR fisheries OR trout OR bass OR salmon OR walleye) conservation outdoors when:365d'},
  {name:'Conservation Wire',query:'("wildlife conservation" OR habitat OR "public lands" OR "migration corridor" OR CWD OR EHD) hunting when:365d'},
  {name:'Regulations Wire',query:'("hunting regulations" OR "tag allocation" OR "draw odds" OR "season changes" OR "hunting legislation") when:365d'},
  {name:'Research Wire',query:'(elk OR deer OR wolves OR wildlife) (study OR research OR population OR migration OR mortality) when:365d'}
];

// Species + state discovery. These feeds deliberately search beyond agency sites so a state/species
// filter can surface reporting from hunting media, conservation groups, local news, and agencies.
const speciesStateCoverage = {
  'Elk': ['Alaska','Arizona','Arkansas','California','Colorado','Idaho','Kansas','Kentucky','Michigan','Minnesota','Missouri','Montana','Nebraska','Nevada','New Mexico','North Carolina','North Dakota','Oklahoma','Oregon','Pennsylvania','South Dakota','Tennessee','Utah','Virginia','Washington','Wisconsin','Wyoming'],
  'Whitetail': ['Alabama','Arkansas','Colorado','Connecticut','Delaware','Florida','Georgia','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','New Hampshire','New Jersey','New York','North Carolina','North Dakota','Ohio','Oklahoma','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Vermont','Virginia','West Virginia','Wisconsin','Wyoming'],
  'Mule Deer': ['Arizona','California','Colorado','Idaho','Kansas','Montana','Nebraska','Nevada','New Mexico','North Dakota','Oklahoma','Oregon','South Dakota','Texas','Utah','Washington','Wyoming']
};
const speciesTerms = {
  'Elk': '(elk OR wapiti)',
  'Whitetail': '(whitetail OR "white-tailed deer" OR "white tailed deer")',
  'Mule Deer': '("mule deer" OR muley OR muleys)'
};
const speciesStateQueries = Object.entries(speciesStateCoverage).flatMap(([species, stateList]) =>
  stateList.map(state => ({
    name:`${state} ${species} Wire`,
    stateHint:state,
    query:`"${state}" ${speciesTerms[species]} (hunting OR harvest OR population OR migration OR habitat OR conservation OR regulations OR season OR tags OR draw OR disease OR predators) when:365d`
  }))
);

const allFeeds = [...publisherQueries, ...stateAgencies, ...directStateQueries, ...broadQueries, ...speciesStateQueries];

const taxonomy = {
  'Elk': ['elk','wapiti'],
  'Whitetail': ['whitetail','white-tailed','white tailed'],
  'Mule Deer': ['mule deer','muley','muleys'],
  'Big Game': ['big game','pronghorn','antelope','moose','caribou','bighorn','sheep','mountain goat'],
  'Wolves & Predators': ['wolf','wolves','coyote','cougar','mountain lion','grizzly','predator','black bear'],
  'Fishing': ['fishing','fishery','fisheries','angler','trout','bass','salmon','walleye','steelhead','crappie','catfish'],
  'Conservation': ['conservation','habitat','public land','public lands','migration corridor','wildlife crossing','winter range','access','restoration'],
  'Regulations': ['regulation','season','draw','tag','license','quota','legislation','ban','rule change','application deadline','permit'],
  'Research': ['study','research','survey','population estimate','mortality','recruitment','migration','disease','cwd','ehd','chronic wasting']
};

const states = [
'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
];
const stateAliases = {
  Colorado:['Colorado','Colo.'], Wyoming:['Wyoming','Wyo.'], Montana:['Montana','Mont.'],
  Idaho:['Idaho'], Utah:['Utah'], Nevada:['Nevada'], Arizona:['Arizona'],
  'New Mexico':['New Mexico'], Oregon:['Oregon'], Washington:['Washington state'],
  Alaska:['Alaska'], Texas:['Texas'], Kansas:['Kansas'], Iowa:['Iowa'], Missouri:['Missouri'],
  Wisconsin:['Wisconsin'], Minnesota:['Minnesota'], Michigan:['Michigan'], Pennsylvania:['Pennsylvania'],
  Ohio:['Ohio'], Kentucky:['Kentucky'], Tennessee:['Tennessee'], Virginia:['Virginia'],
  'West Virginia':['West Virginia'], 'North Carolina':['North Carolina'], 'South Carolina':['South Carolina'],
  Georgia:['Georgia'], Florida:['Florida'], Maine:['Maine'], 'New Hampshire':['New Hampshire'], Vermont:['Vermont'],
  'New York':['New York'], California:['California']
};
for (const s of states) if (!stateAliases[s]) stateAliases[s] = [s];

let cache = { at: 0, stories: [], clusters: [], snapshot: {}, errors: [] };
let refreshInFlight = null;

function decode(s='') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}
function parseRss(xml, expectedSource='') {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const rawTitle = tag(item,'title');
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const feedSource = sourceMatch ? decode(sourceMatch[1]) : '';
    const source = expectedSource || feedSource || 'News';
    const title = rawTitle.replace(new RegExp(`\\s+-\\s+${feedSource.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}$`,'i'),'').trim();
    return { title, link:tag(item,'link'), pubDate:tag(item,'pubDate'), description:tag(item,'description'), source };
  }).filter(x => x.title && x.link && x.pubDate);
}
function classify(story) {
  const text = `${story.title} ${story.description}`.toLowerCase();
  const tags = Object.entries(taxonomy).filter(([,words]) => words.some(w => text.includes(w))).map(([name]) => name);
  if (!tags.length) tags.push('Big Game');
  return [...new Set(tags)];
}
function classifyStates(story) {
  const text = `${story.title} ${story.description}`;
  const found = [];
  for (const [state, aliases] of Object.entries(stateAliases)) {
    if (aliases.some(alias => new RegExp(`(^|[^A-Za-z])${alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^A-Za-z]|$)`,'i').test(text))) found.push(state);
  }
  if (story.stateHint && !found.includes(story.stateHint)) found.unshift(story.stateHint);
  return [...new Set(found)].slice(0,4);
}
function relevanceScore(story) {
  const text = `${story.title} ${story.description}`.toLowerCase();
  let s = 25;
  const weights = [
    [['elk'],18], [['whitetail','white-tailed'],18], [['mule deer'],18],
    [['wolf','wolves'],14], [['cwd','ehd','chronic wasting','disease'],12],
    [['regulation','draw','tag','license','season','quota','permit'],12],
    [['conservation','habitat','public land','migration','access'],10], [['study','research','population','mortality'],8]
  ];
  for (const [terms,w] of weights) if (terms.some(t=>text.includes(t))) s += w;
  if (prioritySources.has(story.source)) s += 8;
  return Math.min(99, Math.round(s));
}
function recencyScore(story) {
  const ageH = Math.max(0,(Date.now()-new Date(story.pubDate).getTime())/36e5);
  return Math.max(0, 100 - (ageH / (24*30))*100);
}
function topScore(story) {
  // Separate importance/relevance from freshness; freshness is intentionally dominant for Top Stories.
  return Math.round(Math.min(99, relevanceScore(story)*0.58 + recencyScore(story)*0.42));
}
function dedupe(stories) {
  const seen = new Map();
  const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\b(the|a|an|to|of|in|for|on|and|with|new)\b/g,'').replace(/\s+/g,' ').trim();
  for (const st of stories) {
    const key = norm(st.title).split(' ').slice(0,10).join(' ');
    if (!key) continue;
    const old = seen.get(key);
    if (!old || new Date(st.pubDate) > new Date(old.pubDate) || relevanceScore(st) > relevanceScore(old)) seen.set(key, st);
  }
  return [...seen.values()];
}

const stopWords = new Set('the a an to of in for on and with new from by at as is are was were be this that after over into about says say will amid its their his her our your how why what who when where more most up down out'.split(' '));
function words(text='') {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2 && !stopWords.has(w)));
}
function jaccard(a,b) {
  const A=words(a), B=words(b); if(!A.size||!B.size) return 0;
  let inter=0; for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}
function sentence(text='') {
  const clean=text.replace(/\s+/g,' ').trim();
  if(!clean) return '';
  const parts=clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (parts[0]||clean).slice(0,280).replace(/\s+\S*$/,'').trim();
}
function summarize(story) {
  const d=sentence(story.description||'');
  if(d && d.toLowerCase()!==story.title.toLowerCase()) return d + (/[.!?]$/.test(d)?'':'.');
  const where=(story.states||[])[0];
  const tags=(story.tags||[]).filter(t=>t!=='Big Game').slice(0,2).join(' and ').toLowerCase();
  return `${where?where+' • ':''}${tags?`A ${tags} development`:'An outdoor development'} reported by ${story.source}.`;
}
function whyCare(story) {
  const tags=new Set(story.tags||[]), state=(story.states||[])[0];
  const prefix=state?`For hunters and anglers watching ${state}, `:'For hunters and anglers, ';
  if(tags.has('Regulations')) return `${prefix}this could affect season structure, tags, licenses, quotas, access, or application planning. Check the original source before making hunt plans.`;
  if(tags.has('Research') && tags.has('Elk')) return `${prefix}this may change how managers and hunters understand elk population trends, movement, recruitment, habitat use, or mortality.`;
  if(tags.has('Research') && tags.has('Mule Deer')) return `${prefix}this may inform mule-deer population, migration, habitat, or survival decisions that ultimately shape future opportunity.`;
  if(tags.has('Research') && tags.has('Whitetail')) return `${prefix}this may affect how whitetail health, habitat, disease, recruitment, or management trends are interpreted.`;
  if(tags.has('Wolves & Predators')) return `${prefix}predator distribution and management can influence prey behavior, wildlife policy, livestock conflict, and hunting regulations.`;
  if(tags.has('Conservation')) return `${prefix}habitat, access, migration corridors, public-land policy, and restoration work can directly affect where wildlife lives and where people can hunt or fish.`;
  if(tags.has('Fishing')) return `${prefix}this may affect fisheries, access, habitat, stocking, regulations, or current angling opportunity.`;
  if(tags.has('Elk')) return `${prefix}this is directly relevant to elk populations, habitat, access, management, or hunting opportunity.`;
  if(tags.has('Mule Deer')) return `${prefix}this is directly relevant to mule-deer populations, habitat, migration, management, or hunting opportunity.`;
  if(tags.has('Whitetail')) return `${prefix}this is directly relevant to whitetail populations, habitat, health, management, or hunting opportunity.`;
  return `${prefix}this development may affect wildlife management, habitat, access, or future hunting and fishing opportunity.`;
}
function importanceScore(story) {
  let s=story.relevance||0;
  if((story.tags||[]).includes('Regulations')) s+=12;
  if((story.tags||[]).includes('Research')) s+=6;
  if((story.states||[]).length) s+=4;
  if(/department|division|parks|wildlife|fish|game|usfws|usgs|blm|forest service/i.test(story.source)) s+=7;
  return Math.min(99,Math.round(s));
}
function clusterStories(stories) {
  const sorted=[...stories].sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
  const clusters=[];
  for(const st of sorted){
    let best=null,bestScore=0;
    for(const c of clusters){
      const age=Math.abs(new Date(st.publishedAt)-new Date(c.publishedAt))/864e5;
      if(age>5) continue;
      const sim=jaccard(st.title,c.title);
      const stateOverlap=(st.states||[]).some(x=>(c.states||[]).includes(x));
      const tagOverlap=(st.tags||[]).filter(x=>x!=='Big Game').some(x=>(c.tags||[]).includes(x));
      const score=sim+(stateOverlap?.08:0)+(tagOverlap?.06:0);
      if(score>bestScore){bestScore=score;best=c;}
    }
    if(best && bestScore>=0.42){
      best.articles.push(st);
      best.sources=[...new Set(best.articles.map(x=>x.source))];
      best.tags=[...new Set(best.articles.flatMap(x=>x.tags||[]))];
      best.states=[...new Set(best.articles.flatMap(x=>x.states||[]))].slice(0,5);
      if(new Date(st.publishedAt)>new Date(best.publishedAt)){
        best.title=st.title; best.link=st.link; best.publishedAt=st.publishedAt; best.source=st.source;
        best.summary=st.summary; best.whyCare=st.whyCare;
      }
      best.relevance=Math.max(best.relevance,st.relevance);
      best.importance=Math.max(best.importance,st.importance);
    } else {
      clusters.push({
        id:`c${clusters.length+1}`,...st,articles:[st],sources:[st.source],importance:st.importance
      });
    }
  }
  for(const c of clusters){
    const sourceBoost=Math.min(18,(c.sources.length-1)*6);
    c.clusterScore=Math.min(99,Math.round(c.score+sourceBoost));
    c.sourceCount=c.sources.length;
    c.articleCount=c.articles.length;
  }
  return clusters;
}
function buildSnapshot(stories, clusters){
  const recent=stories.filter(s=>Date.now()-new Date(s.publishedAt).getTime()<=7*864e5);
  const countBy=(getter)=>Object.entries(recent.reduce((a,s)=>{for(const x of getter(s)){a[x]=(a[x]||0)+1}return a},{})).sort((a,b)=>b[1]-a[1]);
  return {
    last7Days:recent.length,
    multiSourceClusters:clusters.filter(c=>c.sourceCount>1).length,
    regulationAlerts:recent.filter(s=>(s.tags||[]).includes('Regulations')).length,
    researchSignals:recent.filter(s=>(s.tags||[]).includes('Research')).length,
    predatorSignals:recent.filter(s=>(s.tags||[]).includes('Wolves & Predators')).length,
    topStates:countBy(s=>s.states||[]).slice(0,6).map(([name,count])=>({name,count})),
    topTopics:countBy(s=>s.tags||[]).slice(0,7).map(([name,count])=>({name,count})),
    latestRegulations:recent.filter(s=>(s.tags||[]).includes('Regulations')).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,4).map(s=>({title:s.title,source:s.source,states:s.states,publishedAt:s.publishedAt,link:s.link})),
    latestResearch:recent.filter(s=>(s.tags||[]).includes('Research')).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,4).map(s=>({title:s.title,source:s.source,states:s.states,publishedAt:s.publishedAt,link:s.link}))
  };
}

async function fetchQuery(feed) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(feed.query)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: { 'user-agent':'OutdoorIntel/3.0 (+local dashboard)' }, signal: AbortSignal.timeout(4500) });
  if (!r.ok) throw new Error(`${feed.name}: ${r.status}`);
  const xml = await r.text();
  return parseRss(xml, feed.forceSource ? feed.name : '').slice(0,12).map(st => ({...st, queryGroup:feed.name, stateHint:feed.stateHint || ''}));
}
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = { status:'fulfilled', value:await fn(items[i]) }; }
      catch (reason) { results[i] = { status:'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)}, worker));
  return results;
}
async function refresh(force=false) {
  if (!force && Date.now()-cache.at < CACHE_MS && cache.stories.length) return cache;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
  const settled = await mapConcurrent(allFeeds, FETCH_CONCURRENCY, fetchQuery);
  const stories = [], errors = [];
  settled.forEach(r => r.status==='fulfilled' ? stories.push(...r.value) : errors.push(String(r.reason?.message||r.reason)));
  const cutoff = Date.now() - MAX_INGEST_AGE_DAYS*864e5;
  const normalized = dedupe(stories)
    .filter(st => Number.isFinite(new Date(st.pubDate).getTime()) && new Date(st.pubDate).getTime() >= cutoff)
    .map(st => {
      const base={...st,tags:classify(st),states:classifyStates(st),relevance:relevanceScore(st),score:topScore(st),publishedAt:new Date(st.pubDate).toISOString()};
      return {...base,importance:importanceScore(base),summary:summarize(base),whyCare:whyCare(base)};
    })
    .sort((a,b)=> new Date(b.publishedAt)-new Date(a.publishedAt))
    .slice(0,MAX_STORIES);
  const clusters=clusterStories(normalized);
  const snapshot=buildSnapshot(normalized,clusters);
  if (normalized.length) cache = { at:Date.now(), stories:normalized, clusters, snapshot, errors };
  else if (!cache.stories.length) cache = { at:Date.now(), stories:[], clusters:[], snapshot:buildSnapshot([],[]), errors };
  return cache;
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}

async function scheduledRefresh() {
  try {
    const before = cache.at;
    const data = await refresh(true);
    console.log(`[refresh] ${new Date().toISOString()} • ${data.stories.length} stories • ${data.clusters.length} clusters • ${data.errors.length} feed errors${before ? '' : ' • initial warm'}`);
  } catch (err) {
    console.error('[refresh] failed', err);
  }
}

const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname === '/api/stories') {
      const data = await refresh(u.searchParams.get('refresh')==='1');
      const uniqueSources = new Set(data.stories.map(s=>s.source));
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({
        ...data,
        refreshedAt:new Date(data.at).toISOString(),
        sourceCount:allFeeds.length,
        uniqueSourceCount:uniqueSources.size,
        stateAgencyCount:stateAgencies.length,
        states,
        version:'3.0.0',
        feedErrors:data.errors.length
      }));
    }
    if (u.pathname === '/health') {
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true, version:'3.1-production', refreshedAt:cache.at?new Date(cache.at).toISOString():null, stories:cache.stories.length, refreshMinutes:REFRESH_MINUTES}));
    }
    if (u.pathname === '/robots.txt') {
      const site=(process.env.SITE_URL||'').replace(/\/$/,'');
      res.writeHead(200, {'content-type':'text/plain; charset=utf-8'});
      return res.end(`User-agent: *\nAllow: /\n${site?`Sitemap: ${site}/sitemap.xml\n`:''}`);
    }
    if (u.pathname === '/sitemap.xml') {
      const site=(process.env.SITE_URL||`https://${req.headers.host}`).replace(/\/$/,'');
      const last=cache.at?new Date(cache.at).toISOString():new Date().toISOString();
      res.writeHead(200, {'content-type':'application/xml; charset=utf-8'});
      return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}/</loc><lastmod>${last}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url></urlset>`);
    }
    let file = u.pathname==='/' ? '/index.html' : u.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(__dirname,'public',file);
    if (!full.startsWith(path.join(__dirname,'public'))) throw new Error('bad path');
    const buf = await fs.readFile(full);
    res.writeHead(200, {'content-type': mime[path.extname(full)] || 'application/octet-stream'}); res.end(buf);
  } catch (e) {
    if (String(e.code)==='ENOENT') { res.writeHead(404); res.end('Not found'); }
    else { console.error(e); res.writeHead(500); res.end('Server error'); }
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nOutdoor Intel production → http://0.0.0.0:${PORT}\nWatching ${allFeeds.length} discovery feeds across ${stateAgencies.length} state wildlife agencies.\nAutomatic refresh: every ${REFRESH_MINUTES} minutes.\n`);
  void scheduledRefresh();
  const timer=setInterval(() => void scheduledRefresh(), REFRESH_MINUTES*60*1000);
  timer.unref?.();
});
