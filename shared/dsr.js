// Smash Rating engine (shown to members as the SDX Rating).
// Shared by the staff tool (/admin) and SmashDex (/smashdex). Change it in one place only.
// compute(seeds, matches, today, adjustments?) — seeds: {name:{seed,assessedAt?}},
// matches: openPlayMatches values with current names, adjustments: [{name,date,at,to,by}].
const DSR = {
  SCALE:7/1000,DIVISOR:400,
  K:{provisional:60,established:32,veteran:20},
  ZONES:[{name:"Growth",lo:0,hi:3,gain:1.3,loss:0.9},{name:"Qualification",lo:3,hi:4,gain:0.65,loss:1.0},{name:"Elite",lo:4,hi:99,gain:0.35,loss:1.15}],
  QUALITY_GATE:{from:4.5,oppBelow:3.5,gain:0.15},
  TOP_DAMPENER:{above:6.5,factor:0.5},
  W:{league:1,openplay:1,competitive:1,americano:0.25},
  PROVISIONAL:{sets:8,partners:4,opponents:6},
  BREAK:{faster:90,provisional:180,hidden:365},
  BANDS:[["Beginner",0],["Beginner+",1],["Lower Intermediate",2],["Intermediate",3],["Intermediate High",4],["Advanced",5],["Elite",6]],
  TAG_SEED:{"Beginner":0.75,"Beginner / Beginner+":1.0,"Beginner+":1.5,"Beginner+ / Inter":2.0,"Inter":2.5,"Inter / Inter+":3.0,"Strong Inter":3.5,"Inter+":3.5},
  TAG_ORDER:["Beginner","Beginner / Beginner+","Beginner+","Beginner+ / Inter","Inter","Inter / Inter+","Strong Inter","Inter+"],
  SEED_FLOOR:0.5,SEED_CAP:4.0,DEFAULT_SEED:0.5,
  // Fixed seeds for guest placeholders — engine uses these for expected-score but never updates them
  GUEST_SEEDS:{"Guest – Beginner":0.75,"Guest – Beginner+":1.5,"Guest – Lower Intermediate":2.5,"Guest – Intermediate":3.5,"Guest – Intermediate High":4.5,"Guest – Advanced":5.5,"Guest – Elite":6.5,"Guest – Unknown":2.5},
};
DSR.band=r=>{let b=DSR.BANDS[0][0];for(const[n,lo]of DSR.BANDS)if(r>=lo-1e-9)b=n;return b;};
DSR.zone=r=>DSR.ZONES.find(z=>r>=z.lo-1e-9&&r<z.hi)||DSR.ZONES[0];
DSR.expected=(ra,rb)=>1/(1+Math.pow(10,-((ra-rb)/DSR.SCALE)/DSR.DIVISOR));
const dayNum=d=>Math.round(new Date(d+"T00:00:00Z").getTime()/864e5);
DSR.setsIn=m=>m.sets||String(m.score||"").split(",").filter(s=>s.trim()).length||1;
DSR.isProvisional=p=>p.sets<DSR.PROVISIONAL.sets||p.partners.size<DSR.PROVISIONAL.partners||p.opps.size<DSR.PROVISIONAL.opponents;
DSR.seedFromHistory=(games,today)=>{
  const t=dayNum(today);const g=games.filter(x=>x.level in DSR.TAG_SEED&&t-dayNum(x.date)<=183);
  if(!g.length)return null;
  const cnt={};g.forEach(x=>cnt[x.level]=(cnt[x.level]||0)+1);
  const order=DSR.TAG_ORDER;let tag=null,atOrAbove=0;
  for(let i=order.length-1;i>=0;i--){const c=cnt[order[i]]||0;atOrAbove+=c;if(c>=3||(c&&atOrAbove/g.length>=0.4)){tag=order[i];break;}}
  if(!tag)tag=g[g.length-1].level;
  let seed=DSR.TAG_SEED[tag],why=`Seeded from ${tag} open plays`;
  const higher=order.slice(order.indexOf(tag)+1).filter(l=>DSR.TAG_SEED[l]>DSR.TAG_SEED[tag]).reduce((s,l)=>s+(cnt[l]||0),0);
  if(higher>=3){seed+=0.25;why+="; +0.25 for 3+ games a level up";}
  if(g.length<3){seed-=0.25;why+="; −0.25 for fewer than 3 games";}
  return{seed:Math.min(DSR.SEED_CAP,Math.max(DSR.SEED_FLOOR,seed)),tag,why};
};
DSR.compute=(seeds,matches,today,adjustments)=>{
  const S={};
  // Build a guest-seed map from match records (for named guests like "Ravi" added with a level)
  const matchGuestSeeds={};matches.forEach(m=>{if(m.guestSeeds)Object.assign(matchGuestSeeds,m.guestSeeds);});
  const get=n=>{const gs=DSR.GUEST_SEEDS[n]??matchGuestSeeds[n]??null;const s=seeds[n]?.seed??gs??DSR.DEFAULT_SEED;return S[n]||(S[n]={name:n,seed:s,r:s,me:0,sets:0,matches:0,last:null,partners:new Set(),opps:new Set(),hist:[]});}
  Object.keys(seeds).forEach(get);
  const list=matches.filter(m=>m.status==="confirmed"&&DSR.W[m.format]).slice().sort((x,y)=>x.date.localeCompare(y.date)||String(x.enteredAt||"").localeCompare(String(y.enteredAt||"")));
  // Manual rating adjustments (self-lowering or admin) sit on the same timeline as matches
  const adj=(adjustments||[]).filter(a=>a&&a.name&&a.date&&isFinite(+a.to)).slice().sort((x,y)=>x.date.localeCompare(y.date)||String(x.at||"").localeCompare(String(y.at||"")));
  const events=[];let ai=0;
  for(const m of list){
    while(ai<adj.length&&(adj[ai].date<m.date||(adj[ai].date===m.date&&String(adj[ai].at||"~")<String(m.enteredAt||""))))events.push({adj:adj[ai++]});
    events.push({m});
  }
  while(ai<adj.length)events.push({adj:adj[ai++]});
  for(const ev of events){
    if(ev.adj){const a=ev.adj,p=get(a.name),before=p.r;p.r=Math.min(7,Math.max(0,+a.to));
      p.hist.push({date:a.date,r:p.r,delta:p.r-before,manual:true,by:a.by||"self",id:a.id||null});continue;}
    const m=ev.m;
    const A=m.teamA.map(get),B=m.teamB.map(get);
    const W=DSR.W[m.format];const d=dayNum(m.date);
    // Parse individual sets when available (score like "6-3, 4-6"), else treat as one set
    const setScores=(()=>{
      if(m.setsData&&Array.isArray(m.setsData)&&m.setsData.length)return m.setsData.map(s=>({a:s.a,b:s.b}));
      const parts=String(m.score||"").split(/[,;]/).map(s=>s.trim()).filter(s=>/^\d{1,2}-\d{1,2}$/.test(s));
      if(parts.length>1)return parts.map(s=>{const[a,b]=s.split('-').map(Number);return{a,b};});
      return[{a:m.a,b:m.b}];
    })();
    const nSets=setScores.length;
    const apply=(p,team,opp,oppAvg,surprise,isFirst)=>{
      // Guest placeholders: used for expected-score only, never rated
      if(p.name.startsWith('Guest – ')||matchGuestSeeds[p.name]!=null)return;
      // Skip this match for a player whose staff assessment started after the match date
      if(seeds[p.name]?.assessedAt&&m.date<seeds[p.name].assessedAt)return;
      const away=p.last==null?0:d-p.last;
      let status=DSR.isProvisional(p)?"provisional":p.me<30?"established":"veteran";
      if(away>=DSR.BREAK.provisional)status="provisional";
      else if(away>=DSR.BREAK.faster&&status==="veteran")status="established";
      let K=DSR.K[status];if(p.r>DSR.TOP_DAMPENER.above)K*=DSR.TOP_DAMPENER.factor;
      const z=DSR.zone(p.r);let mult=surprise>=0?z.gain:z.loss;
      if(surprise>0&&p.r>=DSR.QUALITY_GATE.from&&oppAvg<DSR.QUALITY_GATE.oppBelow)mult=DSR.QUALITY_GATE.gain;
      const delta=K*mult*W*surprise*DSR.SCALE;const before=p.r;
      p.r=Math.min(7,Math.max(0,p.r+delta));
      if(isFirst){p.me+=W;p.sets+=nSets*W;p.matches++;p.last=d;
        team.filter(x=>x!==p).forEach(x=>p.partners.add(x.name));opp.forEach(x=>p.opps.add(x.name));}
      p.hist.push({date:m.date,r:p.r,delta:p.r-before,id:m.id});
    };
    setScores.forEach((ss,si)=>{
      const ra=(A[0].r+A[1].r)/2,rb=(B[0].r+B[1].r)/2;
      const E=DSR.expected(ra,rb);const Sa=ss.a/(ss.a+ss.b);
      const isFirst=si===0;
      A.forEach(p=>apply(p,A,B,rb,Sa-E,isFirst));B.forEach(p=>apply(p,B,A,ra,E-Sa,isFirst));
    });
  }
  const t=dayNum(today);
  Object.values(S).forEach(p=>{
    const away=p.last==null?null:t-p.last;
    p.badge=(DSR.isProvisional(p)||(away!=null&&away>=DSR.BREAK.provisional))?"Provisional":p.me<30?"Established":"Veteran";
    p.hidden=away!=null&&away>DSR.BREAK.hidden;
    p.band=DSR.band(p.r);p.zone=DSR.zone(p.r).name;
    p.trend=p.hist.filter(h=>!h.manual).slice(-5).reduce((s,h)=>s+h.delta,0);
    p.lastDelta=(p.hist.filter(h=>!h.manual).slice(-1)[0]||{}).delta||0;
    p.confidence=DSR.confidence(p,t);
  });
  return{players:S};
};
// Confidence 0–100: how settled a rating is (amount, variety and recency of play).
DSR.confidence=(p,t)=>{
  const away=p.last==null?999:t-p.last;
  let c=Math.min(1,p.sets/25)*45+Math.min(1,p.partners.size/6)*20+Math.min(1,p.opps.size/10)*20+(away<=30?15:away<=90?8:0);
  if(away>=DSR.BREAK.provisional)c*=0.5;
  return Math.round(c);
};
DSR.confidenceLabel=c=>c<40?"Low":c<70?"Medium":"High";
export { DSR };
