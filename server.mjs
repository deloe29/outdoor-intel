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
  {name:'Research Wire',query:'(elk OR deer OR wolves OR wildlife) (study OR research OR population OR migration OR mortality) when:365d'},

  // Public-land policy discovery: catches major federal actions that matter to hunters even when
  // the headline never says "hunting" (for example Roadless Rule, NEPA, logging, access, land-use rules).
  {name:'Public Lands Policy Wire',query:'("public lands" OR "national forest" OR "national forests" OR roadless OR wilderness OR BLM OR "Forest Service") (rule OR repeal OR rescind OR policy OR proposal OR legislation OR access OR logging OR mining OR development) when:365d'},
  {name:'Federal Rulemaking Wire',query:'(USDA OR "Forest Service" OR BLM OR "Fish and Wildlife Service") ("Federal Register" OR "public comment" OR rulemaking OR "proposed rule" OR "final rule") (land OR forest OR wildlife OR habitat OR recreation) when:365d'},
  {name:'Roadless & Forest Policy Wire',query:'("Roadless Rule" OR "Roadless Area Conservation Rule" OR roadless OR "forest management") (USDA OR "Forest Service" OR logging OR roads OR wildfire OR habitat) when:365d'},
  {name:'Outdoor Legislation Wire',query:'(Congress OR Senate OR House OR legislation OR bill OR amendment) ("public lands" OR hunting OR fishing OR wildlife OR habitat OR "national forest") when:365d'},
  {name:'Access & Habitat Policy Wire',query:'(access OR easement OR roadless OR roads OR closure OR development OR logging OR mining OR drilling) ("public land" OR "public lands" OR "national forest" OR wildlife OR habitat) when:365d'}
];

// Hunter-impact discovery. These deliberately look beyond stories explicitly labeled as "hunting".
// The query must still intersect land, wildlife, access, habitat, fish, game, or recreation terms so
// Outdoor Intel catches consequential policy and environmental developments without becoming generic news.
const hunterImpactQueries = [
  {name:'Federal Public Lands Wire',query:'(USDA OR BLM OR "Forest Service" OR "Interior Department" OR "National Park Service") ("public lands" OR "national forest" OR wilderness OR habitat OR wildlife OR recreation) (rule OR policy OR proposal OR plan OR closure OR access OR sale OR transfer) when:365d'},
  {name:'Federal Register Outdoors Wire',query:'site:federalregister.gov (wildlife OR habitat OR "public lands" OR "national forest" OR hunting OR fishing OR endangered) (rule OR notice OR proposal OR permit OR plan) when:365d'},
  {name:'Congress Outdoors Wire',query:'site:congress.gov (wildlife OR hunting OR fishing OR "public lands" OR habitat OR conservation OR "national forest") (bill OR act OR resolution) when:365d'},
  {name:'Court & Legal Outdoors Wire',query:'(court OR judge OR lawsuit OR ruling OR injunction OR settlement) (wildlife OR hunting OR fishing OR "public lands" OR "national forest" OR habitat OR endangered OR wolves) when:365d'},
  {name:'Access & Closure Wire',query:'(closure OR closed OR reopening OR access OR easement OR road OR gate OR trailhead) (hunting OR fishing OR wildlife OR "public land" OR "public lands" OR "national forest") when:365d'},
  {name:'Land Sale & Transfer Wire',query:'(sale OR transfer OR disposal OR exchange OR acquisition) ("public land" OR "public lands" OR BLM OR "national forest" OR wildlife habitat) when:365d'},
  {name:'Wildfire & Hunting Access Wire',query:'(wildfire OR "wildland fire" OR burn OR closure OR "fire restrictions") (hunting OR fishing OR wildlife OR habitat OR "national forest" OR BLM) when:365d'},
  {name:'Drought & Water Wildlife Wire',query:'(drought OR water OR streamflow OR reservoir OR snowpack) (wildlife OR elk OR deer OR fisheries OR fish OR habitat OR hunting OR fishing) when:365d'},
  {name:'Energy & Habitat Wire',query:'(drilling OR oil OR gas OR solar OR wind OR transmission OR energy) (wildlife OR habitat OR migration OR "public lands" OR hunting OR fishing) when:365d'},
  {name:'Mining & Habitat Wire',query:'(mine OR mining OR mineral OR lithium OR copper OR uranium) (wildlife OR habitat OR migration OR "public lands" OR hunting OR fishing) when:365d'},
  {name:'Logging & Forest Habitat Wire',query:'(logging OR timber OR thinning OR "forest management" OR roads) (wildlife OR habitat OR elk OR deer OR hunting OR "national forest") when:365d'},
  {name:'Endangered Species Policy Wire',query:'("Endangered Species Act" OR endangered OR threatened OR delist OR delisting OR listing) (wildlife OR wolf OR grizzly OR fish OR habitat OR hunting) when:365d'},
  {name:'Wildlife Disease Wire',query:'(CWD OR "chronic wasting disease" OR EHD OR "avian influenza" OR disease) (deer OR elk OR wildlife OR waterfowl OR hunting) when:365d'},
  {name:'Wildlife Funding Wire',query:'(funding OR budget OR grant OR appropriations) (wildlife OR habitat OR conservation OR hunting OR fishing OR "public lands") when:365d'},
  {name:'Tribal Wildlife Management Wire',query:'(tribal OR tribe OR treaty OR co-management OR comanagement) (wildlife OR hunting OR fishing OR elk OR deer OR salmon OR "public lands") when:365d'},
  {name:'Agriculture & Wildlife Habitat Wire',query:'(agriculture OR farm OR ranch OR grazing OR CRP OR "Farm Bill") (wildlife OR habitat OR deer OR elk OR waterfowl OR hunting) when:365d'},
  {name:'Wildlife Ballot & State Law Wire',query:'(ballot OR initiative OR referendum OR governor OR legislature OR lawmakers) (hunting OR fishing OR wildlife OR wolves OR cougar OR bear OR "public lands") when:365d'}
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

// Free hunting-strategy discovery. These searches target practical, publicly readable how-to,
// scouting, calling, terrain, rut, public-land and species tactics from established outdoor publishers.
const strategyQueries = [
  {name:'onX Strategy Feed',sourceName:'onX Hunt',query:'site:onxmaps.com/hunt/blog ("how to hunt" OR tactics OR strategy OR scouting OR calling OR glassing OR "public land") (elk OR whitetail OR "mule deer" OR deer OR "big game") when:365d',forceSource:true},
  {name:'Outdoor Life Strategy Feed',sourceName:'Outdoor Life',query:'site:outdoorlife.com/hunting ("how to" OR tips OR tactics OR strategy OR scouting OR calling OR glassing) (elk OR whitetail OR "mule deer" OR deer OR "big game") when:365d',forceSource:true},
  {name:'Field & Stream Strategy Feed',sourceName:'Field & Stream',query:'site:fieldandstream.com/stories/hunting ("how to" OR tips OR tactics OR strategy OR scouting OR calling OR glassing OR "public land") (elk OR whitetail OR "mule deer" OR deer OR "big game") when:365d',forceSource:true},
  {name:'GOHUNT Strategy Feed',sourceName:'GOHUNT',query:'site:gohunt.com/browse ("tips and tricks" OR "how to" OR tactics OR strategy OR scouting OR glassing OR topo OR calling) (elk OR "mule deer" OR deer OR "big game") when:365d',forceSource:true},
  {name:'MeatEater Strategy Feed',sourceName:'MeatEater',query:'site:themeateater.com/hunt ("how to" OR tips OR tactics OR strategy OR scouting OR calling OR glassing OR whitetail OR elk OR "mule deer") when:365d',forceSource:true},
  {name:'National Deer Association Strategy Feed',sourceName:'National Deer Association',query:'site:deerassociation.com (how OR tips OR tactics OR strategy OR scouting OR habitat OR rut) (whitetail OR deer OR hunting) when:365d',forceSource:true},
  {name:'RMEF Elk Strategy Feed',sourceName:'Rocky Mountain Elk Foundation',query:'site:rmef.org (elk hunting OR elk calling OR elk scouting OR elk tactics OR elk tips) when:365d',forceSource:true},
  {name:'Hunting Strategy Wire',query:'("elk hunting tips" OR "elk hunting tactics" OR "mule deer hunting tips" OR "mule deer hunting tactics" OR "whitetail hunting tips" OR "whitetail hunting tactics" OR "deer hunting strategy" OR "public land hunting tips") when:365d'}
];

const allFeeds = [...publisherQueries, ...stateAgencies, ...directStateQueries, ...broadQueries, ...hunterImpactQueries, ...speciesStateQueries, ...strategyQueries];

const taxonomy = {
  'Elk': ['elk','wapiti'],
  'Whitetail': ['whitetail','white-tailed','white tailed'],
  'Mule Deer': ['mule deer','muley','muleys'],
  'Big Game': ['big game','pronghorn','antelope','moose','caribou','bighorn','sheep','mountain goat'],
  'Wolves & Predators': ['wolf','wolves','coyote','cougar','mountain lion','grizzly','predator','black bear'],
  'Fishing': ['fishing','fishery','fisheries','angler','trout','bass','salmon','walleye','steelhead','crappie','catfish'],
  'Conservation': ['conservation','habitat','public land','public lands','migration corridor','wildlife crossing','winter range','access','restoration','roadless','national forest','national forests','wilderness','forest management','logging','land management','easement','land transfer','land sale','wildfire','drought','water','streamflow','snowpack','drilling','mining','energy development','grazing','crp','farm bill'],
  'Regulations': ['regulation','season','draw','tag','license','quota','legislation','bill','law','ban','rule change','application deadline','permit','proposed rule','final rule','rulemaking','federal register','public comment','repeal','rescind','rescission','court','lawsuit','ruling','injunction','ballot','initiative','referendum','closure','closed','reopening','delist','delisting'],
  'Hunting Strategy': ['how to hunt','hunting tips','hunting tactics','hunt strategy','hunting strategy','scouting','e-scouting','glassing','calling tips','calling sequence','public land hunting','patterning','rut tactics','stand placement','spot and stalk','spot-and-stalk','reading topo','thermals','playing the wind','deer sign'],
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
  const named = {
    amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”'
  };
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,entity)=>{
      const e=entity.toLowerCase();
      if(e[0]==='#'){
        const n=e[1]==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
        return Number.isFinite(n)?String.fromCodePoint(n):' ';
      }
      return Object.prototype.hasOwnProperty.call(named,e)?named[e]:' ';
    })
    .replace(/<[^>]+>/g,' ')
    .replace(/[\u00a0\u2007\u202f]/g,' ')
    .replace(/â€™/g,'’').replace(/â€œ/g,'“').replace(/â€/g,'”').replace(/â€“/g,'–').replace(/â€”/g,'—')
    .replace(/\s+/g,' ').trim();
  return out;
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
    [['conservation','habitat','public land','migration','access','roadless','national forest','logging','wilderness'],10],
    [['rulemaking','proposed rule','final rule','federal register','public comment','repeal','rescind','rescission'],14],
    [['court','lawsuit','ruling','injunction','ballot','initiative','referendum','land transfer','land sale','closure'],12],
    [['wildfire','drought','water','drilling','mining','energy','grazing','farm bill','endangered','delist'],9],
    [['study','research','population','mortality'],8]
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

const stopWords = new Set('the a an to of in for on and with new from by at as is are was were be this that after over into about says say will amid its their his her our your how why what who when where more most up down out could would should may might has have had'.split(' '));
function words(text='') {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2 && !stopWords.has(w)));
}
function jaccard(a,b) {
  const A=words(a), B=words(b); if(!A.size||!B.size) return 0;
  let inter=0; for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}
function cleanText(text='') {
  return decode(String(text||'')).replace(/\s+/g,' ').replace(/\s+([,.!?;:])/g,'$1').trim();
}
function sentences(text='') {
  return cleanText(text).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
}
function meaningfulTerms(text='') {
  return [...words(text)].filter(w=>!/^\d+$/.test(w));
}
const eventPhrases = [
  'roadless rule','endangered species act','chronic wasting disease','public lands','public land','national forest','national forests',
  'forest service','fish and wildlife service','bureau of land management','federal register','public comment','land transfer','land sale',
  'hunting season','tag allocation','license allocation','application deadline','migration corridor','wildlife crossing','winter range',
  'mule deer','white-tailed deer','whitetail deer','mountain lion','grizzly bear','gray wolf','grey wolf','farm bill'
];
const actionGroups = {
  repeal:['repeal','repeals','repealed','repealing','rescind','rescinds','rescinded','rescission','rollback','roll back','scrap','eliminate'],
  propose:['proposal','proposes','proposed','proposing','advance','advances','advanced','rulemaking','public comment'],
  approve:['approve','approves','approved','adopt','adopts','adopted','pass','passes','passed','sign','signs','signed','enact','enacted'],
  block:['block','blocks','blocked','halt','halts','halted','pause','paused','injunction','overturn','overturned','reject','rejected'],
  close:['close','closes','closed','closure','restrict','restricted','restriction','ban','bans','banned'],
  reopen:['reopen','reopens','reopened','restore','restores','restored'],
  expand:['expand','expands','expanded','increase','increases','increased','raise','raises','raised'],
  reduce:['reduce','reduces','reduced','cut','cuts','decrease','decreases','decreased'],
  list:['list','lists','listed','listing','delist','delists','delisted','delisting'],
  sue:['lawsuit','sue','sues','sued','court','ruling','rules','ruled'],
  report:['report','reports','reported','release','releases','released','survey','estimate','study','finds','found']
};
function phraseHits(text='') {
  const t=text.toLowerCase();
  return eventPhrases.filter(p=>t.includes(p));
}
function actionHits(text='') {
  const t=text.toLowerCase();
  const out=[];
  for(const [group,terms] of Object.entries(actionGroups)) if(terms.some(x=>t.includes(x))) out.push(group);
  return out;
}
function eventSignature(story) {
  const text=`${story.title} ${story.description||''}`;
  const phrases=phraseHits(text);
  const actions=actionHits(text);
  const tags=(story.tags||[]).filter(x=>x!=='Big Game');
  const states=story.states||[];
  const titleTerms=meaningfulTerms(story.title).filter(w=>w.length>3).slice(0,14);
  return {phrases,actions,tags,states,titleTerms};
}
function overlapRatio(a=[],b=[]) {
  if(!a.length||!b.length) return 0;
  const B=new Set(b); let n=0; for(const x of a) if(B.has(x)) n++;
  return n/Math.min(a.length,b.length);
}
function eventSimilarity(a,b) {
  const A=a.eventSig||eventSignature(a), B=b.eventSig||eventSignature(b);
  const titleSim=jaccard(a.title,b.title);
  const descSim=jaccard(`${a.title} ${a.description||''}`,`${b.title} ${b.description||''}`);
  const phrase=overlapRatio(A.phrases,B.phrases);
  const action=overlapRatio(A.actions,B.actions);
  const topic=overlapRatio(A.tags,B.tags);
  const state=overlapRatio(A.states,B.states);
  const keyTerms=overlapRatio(A.titleTerms,B.titleTerms);
  let score=titleSim*.24+descSim*.18+phrase*.25+action*.13+topic*.08+state*.04+keyTerms*.08;
  // Strong named-policy/entity matches are usually the same event even when headlines use different verbs.
  if(phrase>=1 && A.phrases.length && B.phrases.length) score+=.18;
  if(action>=1 && A.actions.length && B.actions.length) score+=.08;
  return Math.min(1,score);
}
function sentenceQuality(s, story) {
  const low=s.toLowerCase();
  if(/sign up|newsletter|subscribe|read more|click here|terms of service|privacy policy|advertisement/.test(low)) return -100;
  const titleWords=words(story.title||'');
  const ws=words(s); let overlap=0; for(const w of ws) if(titleWords.has(w)) overlap++;
  const concrete=(s.match(/\b(?:\d[\d,.]*|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|acres?|percent|%|million|billion|miles?|yards?|feet|ft\.?|AM|PM)\b/gi)||[]).length;
  const actions=actionHits(s).length;
  const strategy=/\b(?:find|locate|hunt|scout|glass|call|approach|set up|setup|pattern|bed|feed|wind|thermal|terrain|ridge|bench|drainage|rut|stalk|stand|trail|sign|pressure|access|public land)\b/i.test(s)?2:0;
  return overlap*1.5+concrete*2+actions*2+strategy+Math.min(2,s.length/130);
}
function usefulSentences(story) {
  return sentences(story.description||'')
    .map(cleanText)
    .filter(s=>s.length>=38 && s.toLowerCase()!==cleanText(story.title).toLowerCase())
    .filter(s=>sentenceQuality(s,story)>-50);
}
function bestFactSentence(story) {
  const candidates=usefulSentences(story);
  if(!candidates.length) return '';
  return [...candidates].sort((a,b)=>sentenceQuality(b,story)-sentenceQuality(a,story))[0];
}
function summarize(story) {
  const candidates=usefulSentences(story).sort((a,b)=>sentenceQuality(b,story)-sentenceQuality(a,story));
  const chosen=[];
  for(const s of candidates){
    if(!chosen.some(x=>jaccard(x,s)>.58)) chosen.push(s);
    if(chosen.length>=2) break;
  }
  let text=chosen.join(' ');
  if(!text){
    const where=(story.states||[])[0];
    text=`${where?where+': ':''}${cleanText(story.title)}.`;
  }
  if(text.length>440) text=text.slice(0,437).replace(/\s+\S*$/,'')+'…';
  return /[.!?…]$/.test(text)?text:text+'.';
}
function clusterSummary(cluster) {
  const articles=cluster.articles||[];
  if(!articles.length) return cluster.summary||'';
  const ranked=[];
  for(const a of articles){
    for(const s of usefulSentences(a)) ranked.push({s,a,q:sentenceQuality(s,a)});
  }
  ranked.sort((a,b)=>b.q-a.q);
  const chosen=[];
  for(const item of ranked){
    if(!chosen.some(x=>jaccard(x,item.s)>.58)) chosen.push(item.s);
    if(chosen.length>=2) break;
  }
  if(!chosen.length){
    const lead=[...articles].sort((a,b)=>b.importance-a.importance || new Date(b.publishedAt)-new Date(a.publishedAt))[0];
    return summarize(lead);
  }
  let text=chosen.join(' ');
  if(text.length>470) text=text.slice(0,467).replace(/\s+\S*$/,'')+'…';
  return text;
}
function articleContext(story) {
  const text=`${story.title} ${story.description||''}`.toLowerCase();
  if((story.tags||[]).includes('Hunting Strategy')){
    if(/elk/.test(text)) return 'Practical elk tactics, scouting, calling, terrain or hunt-planning guidance from the source.';
    if(/mule deer|muley/.test(text)) return 'Practical mule-deer tactics covering scouting, glassing, terrain, stalking or seasonal behavior.';
    if(/whitetail|white-tailed/.test(text)) return 'Practical whitetail tactics covering patterning, sign, stand or access strategy, wind, rut behavior or scouting.';
    return 'Practical hunting tactics or planning guidance from the source.';
  }
  if(/roadless|national forest|forest service|land transfer|land sale|public land|public lands|wilderness/.test(text)) return 'Public-land policy or access development with potential consequences for habitat, roads and recreation.';
  if(/tag|license|draw|quota|season|permit|application/.test(text)) return 'Hunting-opportunity update involving tags, seasons, applications, quotas or permits.';
  if(/cwd|chronic wasting|ehd|disease/.test(text)) return 'Wildlife-health development involving disease, testing, herd condition or management response.';
  if(/wolf|wolves|cougar|mountain lion|grizzly|predator/.test(text)) return 'Predator-management or predator-prey development.';
  if((story.tags||[]).includes('Research')) return 'Wildlife research or population-management finding.';
  if((story.tags||[]).includes('Fishing')) return 'Fishing, fisheries or aquatic-habitat update.';
  return 'Outdoor news development summarized from the publisher’s available feed text.';
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
  for(const original of sorted){
    const st={...original,eventSig:eventSignature(original)};
    let best=null,bestScore=0;
    for(const c of clusters){
      const age=Math.abs(new Date(st.publishedAt)-new Date(c.publishedAt))/864e5;
      if(age>8) continue;
      const sim=eventSimilarity(st,c);
      if(sim>bestScore){bestScore=sim;best=c;}
    }
    if(best && bestScore>=0.46){
      best.articles.push(st);
      best.sources=[...new Set(best.articles.map(x=>x.source))];
      best.tags=[...new Set(best.articles.flatMap(x=>x.tags||[]))];
      best.states=[...new Set(best.articles.flatMap(x=>x.states||[]))].slice(0,5);
      // Keep a representative headline from the highest-importance article rather than simply the newest.
      const representative=[...best.articles].sort((a,b)=>b.importance-a.importance || new Date(b.publishedAt)-new Date(a.publishedAt))[0];
      best.title=representative.title; best.link=representative.link; best.source=representative.source;
      best.publishedAt=[...best.articles].sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt))[0].publishedAt;
      best.relevance=Math.max(best.relevance,st.relevance);
      best.importance=Math.max(best.importance,st.importance);
      best.context=articleContext({...representative,tags:best.tags,states:best.states});
      best.summary=clusterSummary(best);
      best.eventSig=eventSignature(best);
    } else {
      clusters.push({
        id:`c${clusters.length+1}`,...st,articles:[st],sources:[st.source],importance:st.importance,eventSig:st.eventSig
      });
    }
  }
  for(const c of clusters){
    c.summary=clusterSummary(c);
    c.context=articleContext(c);
    const sourceBoost=Math.min(18,(c.sources.length-1)*6);
    c.clusterScore=Math.min(99,Math.round(c.score+sourceBoost));
    c.sourceCount=c.sources.length;
    c.articleCount=c.articles.length;
    delete c.eventSig;
    for(const a of c.articles) delete a.eventSig;
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
  const r = await fetch(url, { headers: { 'user-agent':'OutdoorIntel/3.5 (+local dashboard)' }, signal: AbortSignal.timeout(4500) });
  if (!r.ok) throw new Error(`${feed.name}: ${r.status}`);
  const xml = await r.text();
  return parseRss(xml, feed.forceSource ? (feed.sourceName || feed.name) : '').slice(0,12).map(st => ({...st, queryGroup:feed.name, stateHint:feed.stateHint || ''}));
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
      const derivedTags=classify(st); if(/strategy/i.test(st.queryGroup||'') && !derivedTags.includes('Hunting Strategy')) derivedTags.unshift('Hunting Strategy');
      const base={...st,tags:derivedTags,states:classifyStates(st),relevance:relevanceScore(st),score:topScore(st),publishedAt:new Date(st.pubDate).toISOString()};
      return {...base,importance:importanceScore(base),summary:summarize(base),context:articleContext(base)};
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
        version:'3.5.0',
        feedErrors:data.errors.length
      }));
    }
    if (u.pathname === '/health') {
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true, version:'3.5-production', refreshedAt:cache.at?new Date(cache.at).toISOString():null, stories:cache.stories.length, refreshMinutes:REFRESH_MINUTES}));
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
  console.log(`\nOutdoor Intel 3.5 production → http://0.0.0.0:${PORT}\nWatching ${allFeeds.length} discovery feeds across ${stateAgencies.length} state wildlife agencies.\nAutomatic refresh: every ${REFRESH_MINUTES} minutes.\n`);
  void scheduledRefresh();
  const timer=setInterval(() => void scheduledRefresh(), REFRESH_MINUTES*60*1000);
  timer.unref?.();
});
