import React, { useState, useMemo } from "react";

// ══════════════════════════════════════════════════════════════
// SOFRA — CHEF SIDE
// Merge N guest profiles → draft a full menu the chef tweaks.
// Inputs: signatures (authored dishes) + weekly pantry (fresh stock)
// Hard layer: allergies/restrictions can never be violated.
// ══════════════════════════════════════════════════════════════

const C = {
  ink:"#141013", ink2:"#1E181B", panel:"#211A1D", line:"rgba(243,233,221,0.1)",
  burgundy:"#5C1A1B", burgundyLit:"#7A2324", cream:"#F3E9DD", dim:"#B7A493",
  faint:"#83725F", gold:"#D9A15B", rose:"#C97B6E", sage:"#8AA06E", danger:"#E0776B",
};

// ── the table: individual guest profiles that arrived via RSVP ──
const GUESTS = [
  { name:"Layla",  diet:[],            avoid:[],            drinks:["Wine"],       adv:70 },
  { name:"Omar",   diet:[],            avoid:["Pork"],      drinks:["Cocktails"],  adv:85 },
  { name:"Nadia",  diet:["Vegetarian"],avoid:["Nuts"],      drinks:["Wine"],       adv:55 },
  { name:"Sam",    diet:[],            avoid:["Shellfish"], drinks:["Beer"],       adv:40 },
  { name:"Yara",   diet:["Pescatarian"],avoid:[],           drinks:["Wine"],       adv:75 },
  { name:"Tarek",  diet:[],            avoid:["Pork"],      drinks:["Cocktails"],  adv:90 },
  { name:"Mona",   diet:["Vegetarian"],avoid:["Mushrooms"], drinks:["Alcohol-free"],adv:35 },
  { name:"Dana",   diet:[],            avoid:["Nuts"],      drinks:["Wine"],       adv:60 },
];

// ── chef inputs ──
const SIGNATURES = [
  { id:"s1", name:"Whole Grilled Sea Bass", tags:["pescatarian","seafood"], contains:[], veg:false },
  { id:"s2", name:"Lamb Shoulder, Slow-Roasted", tags:["meat"], contains:[], veg:false },
  { id:"s3", name:"Charred Eggplant, Tahini", tags:["veg","vegan"], contains:["nuts"], veg:true },
  { id:"s4", name:"Wild Mushroom Orzo", tags:["veg"], contains:["mushrooms"], veg:true },
  { id:"s5", name:"Pistachio & Rose Semifreddo", tags:["dessert","veg"], contains:["nuts"], veg:true },
  { id:"s6", name:"Beef Short Rib, Pomegranate", tags:["meat"], contains:[], veg:false },
];

const PANTRY = [
  "Sea bass","Branzino","Lamb","Short rib","Chicken","Halloumi","Eggplant","Zucchini",
  "Heirloom tomato","Chickpeas","Freekeh","Pomegranate","Preserved lemon","Fennel","Figs","Labneh",
];

const RESTRICTION_MAP = { // avoid/diet token -> ingredients or dish flags it forbids
  Nuts:"nuts", Shellfish:"shellfish", Pork:"pork", Eggs:"eggs", Cilantro:"cilantro",
  Mushrooms:"mushrooms", Vegetarian:"meat", Vegan:"animal", Pescatarian:"meat",
};

export default function ChefApp() {
  const [tab, setTab] = useState("table"); // table | menu | inputs

  // derived table intelligence
  const intel = useMemo(()=>buildIntel(GUESTS), []);
  const [menu, setMenu] = useState(()=>draftMenu(intel));

  return (
    <div style={S.stage}>
      <style>{CSS}</style>
      <div style={S.app}>
        {/* header */}
        <div style={S.head}>
          <div>
            <div style={S.brand}>Sofra <span style={S.brandTag}>· Kitchen</span></div>
            <div style={S.eventLine}>Layla’s Long Table · Fri Aug 14 · {GUESTS.length} covers</div>
          </div>
          <div style={S.covers}>
            {GUESTS.slice(0,5).map((g,i)=>(
              <div key={g.name} style={{ ...S.coverDot, marginLeft:i?-8:0, background:DOT[i%DOT.length] }}>{g.name[0]}</div>
            ))}
            <div style={{ ...S.coverDot, marginLeft:-8, background:"#3A2E2E" }}>+{GUESTS.length-5}</div>
          </div>
        </div>

        {/* tabs */}
        <div style={S.tabs}>
          <Tab id="table" tab={tab} setTab={setTab} label="The Table" />
          <Tab id="menu" tab={tab} setTab={setTab} label="Drafted Menu" />
          <Tab id="inputs" tab={tab} setTab={setTab} label="My Kitchen" />
        </div>

        <div style={S.body}>
          {tab==="table" && <TableView intel={intel} />}
          {tab==="menu" && <MenuView menu={menu} setMenu={setMenu} intel={intel} onRegenerate={()=>setMenu(draftMenu(intel, true))} />}
          {tab==="inputs" && <InputsView />}
        </div>
      </div>
      <p style={S.hint}>
        Chef view. <b>The Table</b> merges every guest’s RSVP into hard limits + soft signals.
        <b> Drafted Menu</b> is auto-composed from your signatures &amp; pantry — swap or regenerate any course.
      </p>
    </div>
  );
}

const DOT = ["#7A2324","#8A5A2B","#4A5240","#6E3B45","#8A6A2B"];

// ═══════════════ TABLE VIEW — the merge ═══════════════
function TableView({ intel }) {
  return (
    <div className="fade">
      {/* HARD constraints — loud, non-negotiable */}
      <div style={{ ...S.card, borderColor:"rgba(224,119,107,0.35)" }}>
        <div style={S.cardHeadRow}>
          <span style={S.cardTitle}>Hard limits</span>
          <span style={S.hardTag}>must not violate</span>
        </div>
        <div style={S.hardWrap}>
          {intel.hard.map((h)=>(
            <div key={h.label} style={S.hardRow}>
              <span style={S.hardLabel}>⛔ {h.label}</span>
              <span style={S.hardWho}>{h.who.join(", ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SOFT signals */}
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.cardTitle}>Diet mix</div>
          <div style={{ marginTop:12 }}>
            <Bar label="Omnivore" n={intel.dietMix.omni} total={GUESTS.length} tint={C.burgundyLit} />
            <Bar label="Pescatarian" n={intel.dietMix.pesc} total={GUESTS.length} tint={C.gold} />
            <Bar label="Vegetarian" n={intel.dietMix.veg} total={GUESTS.length} tint={C.sage} />
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>Drinks</div>
          <div style={{ marginTop:12 }}>
            {Object.entries(intel.drinks).map(([k,v])=>(
              <Bar key={k} label={k} n={v} total={GUESTS.length} tint={C.rose} />
            ))}
          </div>
        </div>
      </div>

      {/* adventurousness */}
      <div style={S.card}>
        <div style={S.cardHeadRow}>
          <span style={S.cardTitle}>Table adventurousness</span>
          <span style={S.advVal}>{intel.advAvg} / 100 · {intel.advLabel}</span>
        </div>
        <div style={S.advTrack}>
          <div style={{ ...S.advFill, width:`${intel.advAvg}%` }} />
          {GUESTS.map((g)=>(
            <div key={g.name} title={g.name} style={{ ...S.advPin, left:`${g.adv}%` }} />
          ))}
        </div>
        <div style={S.advEnds}><span>Keep it familiar</span><span>Chef, surprise me</span></div>
      </div>

      {/* the one-line brief a chef actually wants */}
      <div style={S.brief}>
        <span style={S.briefMark}>✦</span>
        <span>{intel.brief}</span>
      </div>
    </div>
  );
}

// ═══════════════ MENU VIEW — drafted, tweakable ═══════════════
function MenuView({ menu, setMenu, intel, onRegenerate }) {
  const swap = (courseIdx) => {
    setMenu((m)=>{
      const next = [...m];
      const course = next[courseIdx];
      const pool = candidatesFor(course.slot, intel).filter(d=>d.id!==course.dish.id);
      if (pool.length) course.dish = pool[Math.floor(Math.random()*pool.length)];
      return next;
    });
  };
  const lock = (i)=> setMenu((m)=> m.map((c,idx)=> idx===i?{...c, locked:!c.locked}:c));

  return (
    <div className="fade">
      <div style={S.menuTopRow}>
        <div>
          <div style={S.menuTitle}>Tonight’s draft</div>
          <div style={S.menuSub}>Composed for this table. Every dish is allergy-safe by construction.</div>
        </div>
        <button className="regen" onClick={onRegenerate}>↻ Regenerate</button>
      </div>

      {menu.map((course, i)=>(
        <div key={course.slot} style={{ ...S.courseCard, borderColor: course.locked?"rgba(217,161,91,0.4)":C.line }}>
          <div style={S.courseHead}>
            <span style={S.courseSlot}>{course.slot}</span>
            <div style={S.courseActions}>
              <button className="mini" onClick={()=>swap(i)} disabled={course.locked}>Swap</button>
              <button className="mini" onClick={()=>lock(i)}>{course.locked?"Locked ✓":"Lock"}</button>
            </div>
          </div>
          <div style={S.dishName}>{course.dish.name}</div>
          <div style={S.dishOrigin}>{course.dish.origin}</div>

          <Coverage dish={course.dish} intel={intel} />
        </div>
      ))}

      <div style={S.publishRow}>
        <button className="prim" onClick={()=>generateMenuPDF(menu, intel)}>⎙ Generate menu PDF</button>
        <span style={S.publishNote}>Opens a print-ready menu — save as PDF or print.</span>
      </div>
    </div>
  );
}

// ── build a pretty, printable menu in a new window ──
function generateMenuPDF(menu, intel) {
  const dishRows = menu.map(course=>{
    const excluded = course.dish.excludes(intel.guests);
    const note = excluded.length ? `<div class="alt">${course.dish.altNote || "alternative available"}</div>` : "";
    return `
      <div class="course">
        <div class="slot">${course.slot}</div>
        <div class="dish">${course.dish.name}</div>
        <div class="origin">${course.dish.origin==="signature" ? "Chef’s signature" : "Composed for this table"}</div>
        ${note}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Layla’s Long Table — Menu</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; background:#F3E9DD; color:#2A1A1C;
      display:flex; align-items:center; justify-content:center; min-height:100vh; padding:40px; }
    .menu { width:100%; max-width:600px; background:#FBF5EC; padding:64px 56px 56px;
      border:1px solid #DCC9B4; box-shadow:0 20px 60px rgba(0,0,0,0.12); position:relative; }
    .menu:before { content:""; position:absolute; inset:14px; border:1px solid #C9A15B; pointer-events:none; }
    .brand { text-align:center; color:#5C1A1B; font-style:italic; font-size:26px; letter-spacing:0.5px; }
    .rule { width:44px; height:2px; background:#C9A15B; margin:14px auto 26px; }
    .title { text-align:center; font-size:34px; color:#2A1A1C; line-height:1.15; margin-bottom:8px; }
    .meta { text-align:center; color:#8A6A4E; font-size:13px; letter-spacing:2px; text-transform:uppercase; margin-bottom:40px; font-family:system-ui,-apple-system,sans-serif; }
    .course { text-align:center; padding:18px 0; border-bottom:1px solid #E8D9C6; }
    .course:last-of-type { border-bottom:none; }
    .slot { color:#9A7A2B; font-size:11px; letter-spacing:2.5px; text-transform:uppercase; font-family:system-ui,sans-serif; margin-bottom:8px; }
    .dish { font-size:23px; color:#2A1A1C; line-height:1.25; }
    .origin { color:#8A6A4E; font-size:13px; font-style:italic; margin-top:5px; }
    .alt { color:#9A7A2B; font-size:12px; margin-top:6px; font-family:system-ui,sans-serif; }
    .foot { text-align:center; margin-top:38px; color:#8A6A4E; font-size:12px; letter-spacing:1px; font-family:system-ui,sans-serif; }
    .foot .s { color:#5C1A1B; font-style:italic; font-family:Georgia,serif; font-size:15px; letter-spacing:0; }
    @media print { body { background:#FBF5EC; padding:0; } .menu { box-shadow:none; border:none; max-width:none; } }
  </style></head>
  <body><div class="menu">
    <div class="brand">Sofra</div>
    <div class="rule"></div>
    <div class="title">Layla’s Long Table</div>
    <div class="meta">Friday · August 14 · ${intel.guests.length} covers</div>
    ${dishRows}
    <div class="foot">Curated for this table · <span class="s">Sofra</span></div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function Coverage({ dish, intel }) {
  const excluded = dish.excludes(intel.guests);
  const serves = intel.guests.length - excluded.length;
  const ok = excluded.length===0;
  return (
    <div style={{ ...S.cov, borderColor: ok?"rgba(138,160,110,0.3)":"rgba(224,119,107,0.3)" }}>
      <div style={{ ...S.covServes, color: ok?C.sage:C.gold }}>
        {ok ? "✓ Serves the whole table" : `Serves ${serves}/${intel.guests.length}`}
      </div>
      {!ok && (
        <div style={S.covExcl}>
          Excludes {excluded.map(e=>`${e.name} (${e.reason})`).join(", ")}
          <span style={S.covFix}> · {dish.altNote || "alt plated on the side"}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════ INPUTS VIEW — signatures + pantry ═══════════════
function InputsView() {
  const [sigs, setSigs] = useState(SIGNATURES);
  const [pantry, setPantry] = useState(PANTRY);
  const [newSig, setNewSig] = useState("");
  const [newItem, setNewItem] = useState("");

  return (
    <div className="fade">
      <div style={S.card}>
        <div style={S.cardHeadRow}>
          <span style={S.cardTitle}>Your signatures</span>
          <span style={S.faintSm}>dishes Sofra can always plate</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:12 }}>
          {sigs.map((s)=>(
            <div key={s.id} style={S.sigRow}>
              <span style={S.sigName}>{s.name}</span>
              <div style={S.sigTags}>
                {s.tags.map(t=><span key={t} style={S.tag}>{t}</span>)}
                {s.contains.map(c=><span key={c} style={S.tagWarn}>contains {c}</span>)}
              </div>
            </div>
          ))}
        </div>
        <div style={S.addRow}>
          <input className="field sm" placeholder="Add a signature dish…" value={newSig} onChange={(e)=>setNewSig(e.target.value)} />
          <button className="add" onClick={()=>{ if(newSig.trim()){ setSigs([...sigs,{id:Date.now()+"",name:newSig.trim(),tags:[],contains:[],veg:false}]); setNewSig(""); } }}>Add</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeadRow}>
          <span style={S.cardTitle}>This week’s pantry</span>
          <span style={S.faintSm}>what’s fresh — Sofra builds new dishes from it</span>
        </div>
        <div style={S.pantryWrap}>
          {pantry.map((p)=>(
            <span key={p} className="pantry" onClick={()=>setPantry(pantry.filter(x=>x!==p))}>{p} <span style={S.x}>×</span></span>
          ))}
        </div>
        <div style={S.addRow}>
          <input className="field sm" placeholder="Add an ingredient…" value={newItem} onChange={(e)=>setNewItem(e.target.value)} />
          <button className="add" onClick={()=>{ if(newItem.trim()){ setPantry([...pantry,newItem.trim()]); setNewItem(""); } }}>Add</button>
        </div>
      </div>

      <div style={S.brief}>
        <span style={S.briefMark}>✦</span>
        <span>Signatures give Sofra dishes it can trust. The pantry lets it invent new ones that fit the table — without you writing every recipe.</span>
      </div>
    </div>
  );
}

// ═══════════════ LOGIC: merge + draft ═══════════════
function buildIntel(guests) {
  // hard limits: allergies + strict diets, with who
  const hardMap = {};
  const addHard = (label, name) => { (hardMap[label] ||= new Set()).add(name); };
  guests.forEach(g=>{
    g.avoid.forEach(a=>{ if(["Nuts","Shellfish"].includes(a)) addHard(`${a} allergy`, g.name); else addHard(`No ${a.toLowerCase()}`, g.name); });
    if(g.diet.includes("Vegetarian")) addHard("Vegetarian", g.name);
    if(g.diet.includes("Vegan")) addHard("Vegan", g.name);
    if(g.diet.includes("Halal")) addHard("Halal", g.name);
    if(g.diet.includes("Kosher")) addHard("Kosher", g.name);
  });
  const hard = Object.entries(hardMap).map(([label,set])=>({ label, who:[...set] }))
    .sort((a,b)=> (a.label.includes("allergy")? -1:1));

  const dietMix = {
    veg: guests.filter(g=>g.diet.includes("Vegetarian")||g.diet.includes("Vegan")).length,
    pesc: guests.filter(g=>g.diet.includes("Pescatarian")).length,
    omni: guests.filter(g=>g.diet.length===0).length,
  };
  const drinks = {};
  guests.forEach(g=>g.drinks.forEach(d=>{ drinks[d]=(drinks[d]||0)+1; }));

  const advAvg = Math.round(guests.reduce((s,g)=>s+g.adv,0)/guests.length);
  const advLabel = advAvg<40?"cautious":advAvg<60?"balanced":advAvg<78?"adventurous":"daring";

  const vegN = dietMix.veg;
  const brief = `${guests.length} covers, skewing ${advLabel}. ${vegN} need a meat-free main; nut & shellfish allergies are hard stops. Wine-forward table — build a shareable, veg-generous menu with one showpiece protein.`;

  return { guests: guests.map(g=>({...g})), hard, dietMix, drinks, advAvg, advLabel, brief };
}

// candidate dishes per slot, each with an excludes() function
function candidatesFor(slot, intel) {
  const has = (g, ing) => g.avoid.map(a=>RESTRICTION_MAP[a]).includes(ing);
  const isVegOnly = (g) => g.diet.includes("Vegetarian")||g.diet.includes("Vegan");
  const isNoMeat = (g) => isVegOnly(g)||g.diet.includes("Pescatarian");

  const mk = (id,name,origin,rule,altNote) => ({ id,name,origin,altNote,
    excludes:(gs)=>gs.filter(g=>rule(g,{has,isVegOnly,isNoMeat}).ex).map(g=>({name:g.name,reason:rule(g,{has,isVegOnly,isNoMeat}).reason})) });

  const POOLS = {
    "To Start": [
      mk("a1","Mezze Spread — labneh, muhammara-free","from your pantry",(g,h)=>({ex:false}),""),
      mk("a2","Charred Eggplant, Tahini","signature",(g,h)=>({ex:h.has(g,"nuts"),reason:"nut allergy"}),"tahini swapped for olive oil"),
      mk("a3","Heirloom Tomato & Labneh","from your pantry",(g,h)=>({ex:false}),""),
      mk("a4","Halloumi & Fig, Pomegranate","from your pantry",(g,h)=>({ex:false}),""),
    ],
    "Main — Sea": [
      mk("m1","Whole Grilled Sea Bass","signature",(g,h)=>({ex:h.isVegOnly(g),reason:"vegetarian"}),"veg main plated instead"),
      mk("m2","Branzino, Preserved Lemon & Fennel","from your pantry",(g,h)=>({ex:h.isVegOnly(g),reason:"vegetarian"}),"veg main plated instead"),
    ],
    "Main — Land": [
      mk("l1","Lamb Shoulder, Slow-Roasted","signature",(g,h)=>({ex:h.isNoMeat(g),reason:h.isVegOnly(g)?"vegetarian":"pescatarian"}),"fish or veg main instead"),
      mk("l2","Beef Short Rib, Pomegranate","signature",(g,h)=>({ex:h.isNoMeat(g),reason:h.isVegOnly(g)?"vegetarian":"pescatarian"}),"fish or veg main instead"),
    ],
    "Main — Green": [
      mk("g1","Freekeh & Roasted Vegetable Pilaf","from your pantry",(g,h)=>({ex:false}),""),
      mk("g2","Zucchini & Chickpea Tagine","from your pantry",(g,h)=>({ex:false}),""),
      mk("g3","Wild Mushroom Orzo","signature",(g,h)=>({ex:h.has(g,"mushrooms"),reason:"no mushrooms"}),"orzo with fennel instead"),
    ],
    "To Finish": [
      mk("d1","Figs, Labneh & Honey","from your pantry",(g,h)=>({ex:false}),""),
      mk("d2","Pistachio & Rose Semifreddo","signature",(g,h)=>({ex:h.has(g,"nuts"),reason:"nut allergy"}),"citrus sorbet instead"),
    ],
  };
  return POOLS[slot] || [];
}

// pick the best (fewest-exclusion) candidate per slot
function draftMenu(intel, shuffle=false) {
  const slots = ["To Start","Main — Sea","Main — Land","Main — Green","To Finish"];
  return slots.map(slot=>{
    let pool = candidatesFor(slot, intel);
    const scored = pool.map(d=>({ d, ex:d.excludes(intel.guests).length }))
      .sort((a,b)=> a.ex-b.ex || (shuffle?Math.random()-0.5:0));
    return { slot, dish: scored[0].d, locked:false };
  });
}

// ── UI atoms ──
function Tab({ id, tab, setTab, label }) {
  return <button className={tab===id?"tab on":"tab"} onClick={()=>setTab(id)}>{label}</button>;
}
function Bar({ label, n, total, tint }) {
  const pct = Math.round((n/total)*100);
  return (
    <div style={S.barRow}>
      <span style={S.barLabel}>{label}</span>
      <div style={S.barTrack}><div style={{ ...S.barFill, width:`${pct}%`, background:tint }} /></div>
      <span style={S.barN}>{n}</span>
    </div>
  );
}

// ── styles ──
const S = {
  stage:{ minHeight:"100vh", background:"#0A0708", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 16px", fontFamily:"Georgia, serif" },
  app:{ width:440, maxWidth:"100%", background:C.ink, borderRadius:28, overflow:"hidden", boxShadow:"0 40px 120px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(217,161,91,0.08)", display:"flex", flexDirection:"column", height:820 },
  hint:{ color:"#5E5248", fontSize:13, marginTop:18, maxWidth:440, textAlign:"center", lineHeight:1.55, fontFamily:"system-ui, sans-serif" },

  head:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"22px 24px 16px" },
  brand:{ color:C.cream, fontSize:24, fontStyle:"italic" },
  brandTag:{ color:C.gold, fontSize:14, fontStyle:"normal", fontFamily:"system-ui, sans-serif", letterSpacing:1 },
  eventLine:{ color:C.dim, fontSize:13, marginTop:4, fontFamily:"system-ui, sans-serif" },
  covers:{ display:"flex", alignItems:"center" },
  coverDot:{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:C.cream, fontSize:13, border:"2px solid "+C.ink },

  tabs:{ display:"flex", gap:6, padding:"0 20px 14px", borderBottom:"1px solid "+C.line },
  body:{ flex:1, overflowY:"auto", padding:"18px 20px 24px" },

  card:{ background:C.panel, border:"1px solid "+C.line, borderRadius:18, padding:18, marginBottom:14 },
  cardHeadRow:{ display:"flex", justifyContent:"space-between", alignItems:"baseline" },
  cardTitle:{ color:C.cream, fontSize:17 },
  faintSm:{ color:C.faint, fontSize:12, fontFamily:"system-ui, sans-serif" },
  grid2:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },

  hardTag:{ color:C.danger, fontSize:11, letterSpacing:1, textTransform:"uppercase", fontFamily:"system-ui, sans-serif", fontWeight:600 },
  hardWrap:{ marginTop:14, display:"flex", flexDirection:"column", gap:9 },
  hardRow:{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 },
  hardLabel:{ color:C.cream, fontSize:14, fontFamily:"system-ui, sans-serif" },
  hardWho:{ color:C.dim, fontSize:12, fontFamily:"system-ui, sans-serif", textAlign:"right" },

  barRow:{ display:"flex", alignItems:"center", gap:10, marginBottom:9 },
  barLabel:{ color:C.dim, fontSize:12, width:88, fontFamily:"system-ui, sans-serif" },
  barTrack:{ flex:1, height:8, background:"rgba(255,255,255,0.06)", borderRadius:8, overflow:"hidden" },
  barFill:{ height:"100%", borderRadius:8 },
  barN:{ color:C.cream, fontSize:12, width:16, textAlign:"right", fontFamily:"system-ui, sans-serif" },

  advVal:{ color:C.gold, fontSize:13, fontFamily:"system-ui, sans-serif" },
  advTrack:{ position:"relative", height:10, background:"rgba(255,255,255,0.06)", borderRadius:8, marginTop:16 },
  advFill:{ position:"absolute", left:0, top:0, bottom:0, background:"linear-gradient(90deg,#5C1A1B,#D9A15B)", borderRadius:8, opacity:0.5 },
  advPin:{ position:"absolute", top:-3, width:4, height:16, background:C.cream, borderRadius:2, transform:"translateX(-50%)", boxShadow:"0 0 0 2px "+C.panel },
  advEnds:{ display:"flex", justifyContent:"space-between", color:C.faint, fontSize:11, marginTop:12, fontFamily:"system-ui, sans-serif" },

  brief:{ display:"flex", gap:10, background:"rgba(217,161,91,0.08)", border:"1px solid rgba(217,161,91,0.22)", borderRadius:16, padding:"14px 16px", color:C.cream, fontSize:14, lineHeight:1.5, fontFamily:"system-ui, sans-serif", marginTop:4 },
  briefMark:{ color:C.gold, fontSize:15 },

  // menu
  menuTopRow:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 },
  menuTitle:{ color:C.cream, fontSize:22 },
  menuSub:{ color:C.dim, fontSize:13, marginTop:4, fontFamily:"system-ui, sans-serif", maxWidth:260, lineHeight:1.4 },
  courseCard:{ background:C.panel, border:"1px solid "+C.line, borderRadius:18, padding:16, marginBottom:12 },
  courseHead:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 },
  courseSlot:{ color:C.gold, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", fontFamily:"system-ui, sans-serif", fontWeight:600 },
  courseActions:{ display:"flex", gap:6 },
  dishName:{ color:C.cream, fontSize:19 },
  dishOrigin:{ color:C.faint, fontSize:12, marginTop:3, fontStyle:"italic" },
  cov:{ border:"1px solid", borderRadius:12, padding:"9px 12px", marginTop:12 },
  covServes:{ fontSize:13, fontFamily:"system-ui, sans-serif", fontWeight:600 },
  covExcl:{ color:C.dim, fontSize:12, marginTop:4, fontFamily:"system-ui, sans-serif", lineHeight:1.45 },
  covFix:{ color:C.faint },

  publishRow:{ display:"flex", alignItems:"center", gap:12, marginTop:18 },
  publishNote:{ color:C.faint, fontSize:12, fontFamily:"system-ui, sans-serif" },

  // inputs
  sigRow:{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid "+C.line },
  sigName:{ color:C.cream, fontSize:15, fontFamily:"system-ui, sans-serif" },
  sigTags:{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end" },
  tag:{ color:C.sage, fontSize:10, border:"1px solid rgba(138,160,110,0.4)", borderRadius:10, padding:"2px 7px", fontFamily:"system-ui, sans-serif" },
  tagWarn:{ color:C.gold, fontSize:10, border:"1px solid rgba(217,161,91,0.4)", borderRadius:10, padding:"2px 7px", fontFamily:"system-ui, sans-serif" },
  addRow:{ display:"flex", gap:8, marginTop:14 },
  pantryWrap:{ display:"flex", flexWrap:"wrap", gap:8, marginTop:14 },
  x:{ color:C.faint },

  covServesOk:{},
};

const CSS = `
  .fade { animation: f .35s ease; }
  @keyframes f { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }

  .tab { background:none; border:none; color:${C.dim}; font-family:Georgia,serif; font-size:15px; padding:8px 6px; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:all .18s; }
  .tab:hover { color:${C.cream}; }
  .tab.on { color:${C.cream}; border-bottom-color:${C.gold}; }

  .prim { background:${C.burgundy}; color:${C.cream}; border:none; padding:13px 22px; border-radius:14px; font-size:15px; font-family:Georgia,serif; cursor:pointer; transition:all .2s; box-shadow:0 8px 26px rgba(92,26,27,0.4); }
  .prim:hover { background:${C.burgundyLit}; transform:translateY(-1px); }

  .regen { background:rgba(217,161,91,0.12); color:${C.gold}; border:1px solid rgba(217,161,91,0.35); padding:9px 14px; border-radius:12px; font-size:13px; font-family:system-ui,sans-serif; cursor:pointer; transition:all .18s; white-space:nowrap; }
  .regen:hover { background:rgba(217,161,91,0.2); }

  .mini { background:rgba(255,255,255,0.05); color:${C.dim}; border:1px solid ${C.line}; padding:5px 11px; border-radius:10px; font-size:12px; font-family:system-ui,sans-serif; cursor:pointer; transition:all .18s; }
  .mini:hover:not(:disabled) { color:${C.cream}; border-color:rgba(243,233,221,0.35); }
  .mini:disabled { opacity:.4; cursor:not-allowed; }

  .field { width:100%; box-sizing:border-box; background:rgba(0,0,0,0.28); border:1px solid ${C.line}; border-radius:12px; padding:12px; color:${C.cream}; font-size:14px; font-family:system-ui,sans-serif; outline:none; transition:border-color .2s; }
  .field:focus { border-color:${C.gold}; }
  .field::placeholder { color:#5E5248; }
  .field.sm { flex:1; }

  .add { background:${C.burgundy}; color:${C.cream}; border:none; padding:0 16px; border-radius:12px; font-size:14px; font-family:system-ui,sans-serif; cursor:pointer; }
  .add:hover { background:${C.burgundyLit}; }

  .pantry { color:${C.dim}; background:rgba(255,255,255,0.04); border:1px solid ${C.line}; border-radius:20px; padding:7px 12px; font-size:13px; font-family:system-ui,sans-serif; cursor:pointer; transition:all .18s; }
  .pantry:hover { color:${C.cream}; border-color:rgba(224,119,107,0.4); }

  ::-webkit-scrollbar { width:0; }
`;
