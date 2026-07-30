import React, { useState, useRef } from "react";

// ══════════════════════════════════════════════════════════════
// SOFRA — "Partiful for dining"  ·  v3
// Phone login · host uploads a COVER PHOTO that becomes the invite
// background · RSVP-gated guest list · condensed survey · profile
// is a LOG of dinners you've attended (revisitable), not preferences
// ══════════════════════════════════════════════════════════════

const C = {
  ink: "#140E10", ink2: "#1E1518", burgundy: "#5C1A1B", burgundyLit: "#7A2324",
  cream: "#F3E9DD", dim: "#B7A493", faint: "#7C6B5F", gold: "#D9A15B", rose: "#C97B6E",
};

const THEMES = [
  { id: "ember", name: "Ember", bg: "radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)", accent: "#D9A15B" },
  { id: "olive", name: "Olive", bg: "radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)", accent: "#D9C05B" },
  { id: "midnight", name: "Midnight", bg: "radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)", accent: "#C97B6E" },
  { id: "saffron", name: "Saffron", bg: "radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)", accent: "#F3D9A0" },
  { id: "plum", name: "Plum", bg: "radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)", accent: "#D98FB0" },
];

const DIETARY = ["Vegetarian","Vegan","Halal","Kosher","Gluten-free","No dairy","Pescatarian"];
const NOGOS = ["Nuts","Shellfish","Pork","Eggs","Cilantro","Mushrooms"];
const DRINKS = ["Cocktails","Wine","Beer","Alcohol-free"];

const SEED_GUESTS = [
  { name: "Layla", i: "L", tint: "#7A2324", host: true },
  { name: "Omar", i: "O", tint: "#8A5A2B" },
  { name: "Nadia", i: "N", tint: "#4A5240" },
  { name: "Sam", i: "S", tint: "#6E3B45" },
  { name: "Yara", i: "Y", tint: "#8A6A2B" },
  { name: "Tarek", i: "T", tint: "#3A4A5A" },
  { name: "Mona", i: "M", tint: "#6A3A5A" },
];

// Past dinners the user has attended — the profile is a LOG of these
const SEED_LOG = [
  { id:"d1", title:"Nadia’s Supper Club", date:"Jul 2 · Boston", venue:"Sarma", theme:"olive", cover:null, count:9, went:"Went" },
  { id:"d2", title:"Omar’s Birthday Feast", date:"Jun 18 · Providence", venue:"Bayberry", theme:"saffron", cover:null, count:14, went:"Went" },
  { id:"d3", title:"Friendsgiving", date:"May 30 · Boston", venue:"Home", theme:"plum", cover:null, count:11, went:"Went" },
];

export default function SofraApp() {
  const [route, setRoute] = useState("login");
  const [me, setMe] = useState(null);
  const [rsvped, setRsvped] = useState(false);
  const [event, setEvent] = useState(DEFAULT_EVENT);
  const [log, setLog] = useState(SEED_LOG);
  const [viewing, setViewing] = useState(null);

  const theme = THEMES.find((t) => t.id === event.theme) || THEMES[0];
  const dark = route === "host" || route === "profile" || route === "past";

  return (
    <div style={S.stage}>
      <style>{CSS}</style>
      <div style={{ ...S.phone, background: dark ? C.ink : theme.bg }}>
        <div style={S.notch} />
        <div style={S.scroll}>
          {route === "login" && <Login onDone={(u)=>{ setMe(u); setRoute("event"); }} />}

          {route === "event" && (
            <EventPage event={event} theme={theme} me={me} rsvped={rsvped} onRSVP={()=>setRoute("rsvp")} />
          )}

          {route === "rsvp" && (
            <RSVPFlow event={event} theme={theme}
              onDone={()=>{
                setRsvped(true);
                setLog((l)=>[{ id:"cur", title:event.title, date:event.date, venue:event.venue,
                  theme:event.theme, cover:event.cover, count:event.count+1, went:"Going" }, ...l]);
                setRoute("event");
              }}
              onCancel={()=>setRoute("event")} />
          )}

          {route === "host" && (
            <HostCreate event={event} setEvent={setEvent} onDone={()=>setRoute("event")} onCancel={()=>setRoute("event")} />
          )}

          {route === "profile" && (
            <ProfilePage me={me} setMe={setMe} log={log}
              onOpen={(d)=>{ setViewing(d); setRoute("past"); }} onBack={()=>setRoute("event")} />
          )}

          {route === "past" && <PastDinner dinner={viewing} onBack={()=>setRoute("profile")} />}
        </div>

        {["event"].includes(route) && (
          <div style={S.nav}>
            <NavBtn active label="Events" icon="◈" onClick={()=>setRoute("event")} />
            <NavBtn label="Host" icon="＋" big onClick={()=>setRoute("host")} />
            <NavBtn label="You" icon="◐" onClick={()=>setRoute("profile")} />
          </div>
        )}
      </div>
      <p style={S.hint}>
        Log in with any number + code <b>0000</b>. In <b>Host</b>, upload a cover photo — it becomes the
        invitation background. <b>You</b> keeps a log of every dinner you’ve been to.
      </p>
    </div>
  );
}

const DEFAULT_EVENT = {
  title: "Layla’s Long Table", tagline: "A dinner for the ones who show up hungry.",
  date: "Fri, Aug 14 · 7:30 PM", venue: "Krasi — Meze & Wine", address: "48 Gloucester St, Boston",
  dress: "Smart casual — wear something you can feast in.", theme: "ember", count: 7, cover: null,
};

// ── LOGIN ──
function Login({ onDone }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [name, setName] = useState("");
  return (
    <div className="fade" style={S.loginWrap}>
      <div style={S.brandBig}>Sofra</div>
      <div style={S.brandSub}>Dining, uninterrupted.</div>
      {step === "phone" && (
        <div style={{ marginTop:40, width:"100%" }}>
          <label style={S.lbl}>Your phone number</label>
          <input className="field" placeholder="(___) ___-____" value={phone} onChange={(e)=>setPhone(e.target.value)} inputMode="tel" autoFocus />
          <button className="prim wide" disabled={phone.length<7} onClick={()=>setStep("code")} style={{ marginTop:14 }}>Send code</button>
          <p style={S.legal}>We text a one-time code. No passwords, ever.</p>
        </div>
      )}
      {step === "code" && (
        <div style={{ marginTop:40, width:"100%" }}>
          <label style={S.lbl}>Enter the code we sent</label>
          <input className="field code" placeholder="0000" value={code} onChange={(e)=>setCode(e.target.value.slice(0,4))} inputMode="numeric" autoFocus />
          <button className="prim wide" disabled={code!=="0000"} onClick={()=>setStep("name")} style={{ marginTop:14 }}>Verify</button>
          <p style={S.legal}>Demo code is 0000.</p>
        </div>
      )}
      {step === "name" && (
        <div className="fade" style={{ marginTop:40, width:"100%" }}>
          <label style={S.lbl}>Welcome. What’s your name?</label>
          <input className="field" placeholder="First name" value={name} onChange={(e)=>setName(e.target.value)} autoFocus />
          <button className="prim wide" disabled={!name.trim()} onClick={()=>onDone({ name:name.trim(), phone, photo:null })} style={{ marginTop:14 }}>Enter Sofra</button>
          <p style={S.legal}>Set once — it stays with your account.</p>
        </div>
      )}
    </div>
  );
}

// ── EVENT PAGE — Partiful-style photo cover on top ──
function EventPage({ event, theme, me, rsvped, onRSVP }) {
  return (
    <div className="fade">
      <Cover event={event} theme={theme} />
      <div style={{ ...S.eyebrow, color: theme.accent, marginTop:18 }}>YOU’RE INVITED</div>
      <h1 style={S.eventTitle}>{event.title}</h1>
      <p style={S.eventTag}>{event.tagline}</p>

      <div style={S.detailList}>
        <Detail icon="🗓️" k="When" v={event.date} />
        <Detail icon="📍" k="Where" v={rsvped ? event.venue : "Krasi — Boston"} sub={rsvped ? event.address : "RSVP to see the address"} locked={!rsvped} />
        <Detail icon="👗" k="Dress code" v={event.dress} accent={theme.accent} />
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>{event.count} going</span>
          {!rsvped && <span style={S.lockTag}>🔒 RSVP to see who</span>}
        </div>
        {rsvped ? (
          <div style={S.avatarWrap}>
            <Ava name="You" i={me?.name?.[0]?.toUpperCase()||"U"} tint={theme.accent} dark />
            {SEED_GUESTS.map((g)=><Ava key={g.name} {...g} />)}
          </div>
        ) : (
          <div style={S.blurWrap}>
            <div style={S.blurRow}>{SEED_GUESTS.slice(0,6).map((g)=><div key={g.name} style={{ ...S.blurAva, background:g.tint }} />)}</div>
            <div style={S.blurNote}>The table’s filling up. Reply to meet them.</div>
          </div>
        )}
      </div>

      {rsvped ? (
        <div style={{ ...S.card, borderColor:"rgba(217,161,91,0.25)" }}>
          <div style={S.cardTitle}>Shared album</div>
          <p style={S.mutedSm}>Photos unlock the night of — drop yours here Friday.</p>
          <div style={S.albumRow}>{["🍽️","🥂","🕯️"].map((e,i)=><div key={i} style={S.albumCell}>{e}</div>)}<div style={S.albumAdd}>＋</div></div>
        </div>
      ) : (
        <div style={S.rsvpDock}>
          <div style={S.rsvpQ}>Will you be at the table?</div>
          <button className="prim wide" onClick={onRSVP}>RSVP</button>
        </div>
      )}
    </div>
  );
}

function Cover({ event, theme, small }) {
  return (
    <div style={{ ...(small ? S.coverSm : S.cover), background: event.cover ? "#000" : theme.bg }}>
      {event.cover ? <img src={event.cover} alt="cover" style={S.coverImg} /> : <><div style={S.heroGlow} /><div style={S.heroEmoji}>🍷</div></>}
    </div>
  );
}

// ── RSVP FLOW — condensed to 2 content screens ──
function RSVPFlow({ event, theme, onDone, onCancel }) {
  const [i, setI] = useState(0);
  const [status, setStatus] = useState(null);
  const [diet, setDiet] = useState([]); const [nogos, setNogos] = useState([]);
  const [drinks, setDrinks] = useState([]); const [adventure, setAdventure] = useState(50);
  const tog = (arr,set,v)=>set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);
  const prog = i===0 ? 50 : 100;

  return (
    <div className="fade" style={S.flowWrap}>
      <div style={S.flowHead}>
        <button className="ghosticon" onClick={()=> i===0?onCancel():setI(0)}>←</button>
        <div style={S.progTrack}><div style={{ ...S.progFill, width:`${prog}%`, background:theme.accent }} /></div>
        <button className="ghosticon" onClick={onCancel}>✕</button>
      </div>

      <div style={S.flowBody}>
        {i === 0 && (
          <>
            <Q>Will you be at {event.title.split("’")[0]}’s table?</Q>
            <Sub>Reply and we’ll seat you.</Sub>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:20 }}>
              {[["going","I’m in 🍷"],["maybe","Maybe"],["cant","Can’t make it"]].map(([v,l])=>(
                <button key={v} className={status===v?"opt sel":"opt"} onClick={()=>{ setStatus(v); v==="cant"?onDone():setI(1); }}>{l}</button>
              ))}
            </div>
          </>
        )}

        {i === 1 && (
          <>
            <Q>How do you eat?</Q>
            <Sub>Sofra keeps this so you never fill it out again.</Sub>

            <SubLabel>Dietary</SubLabel>
            <Chips items={DIETARY} sel={diet} onTog={(v)=>tog(diet,setDiet,v)} accent={theme.accent} />

            <SubLabel>Anything you avoid?</SubLabel>
            <Chips items={NOGOS} sel={nogos} onTog={(v)=>tog(nogos,setNogos,v)} danger />

            <SubLabel>What are you drinking?</SubLabel>
            <Chips items={DRINKS} sel={drinks} onTog={(v)=>tog(drinks,setDrinks,v)} accent={theme.accent} />

            <SubLabel>How brave is your palate?</SubLabel>
            <div style={S.sliderBox}>
              <div style={S.sliderLabel}>
                {adventure<25?"Keep it familiar":adventure<55?"Open to a nudge":adventure<82?"Feed me something new":"Chef, surprise me"}
              </div>
              <input type="range" min="0" max="100" value={adventure} className="slider"
                onChange={(e)=>setAdventure(Number(e.target.value))}
                style={{ background:`linear-gradient(90deg, ${theme.accent} ${adventure}%, rgba(255,255,255,0.08) ${adventure}%)` }} />
              <div style={S.sliderEnds}><span>The usual</span><span>Anything once</span></div>
            </div>

            <button className="prim wide" style={{ marginTop:22 }} onClick={onDone}>Save my spot</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── HOST CREATE — upload cover photo that becomes the invite bg ──
function HostCreate({ event, setEvent, onDone, onCancel }) {
  const [draft, setDraft] = useState(event);
  const fileRef = useRef(null);
  const up = (k,v)=>setDraft((d)=>({ ...d, [k]:v }));
  const theme = THEMES.find((t)=>t.id===draft.theme) || THEMES[0];
  const onCover = (e)=>{ const f=e.target.files?.[0]; if(f) up("cover", URL.createObjectURL(f)); };

  return (
    <div className="fade">
      <div style={S.flowHead}>
        <button className="ghosticon" onClick={onCancel}>←</button>
        <div style={S.hostHeadTitle}>Host a Sofra</div>
        <div style={{ width:34 }} />
      </div>

      <button style={{ ...S.coverEdit, background: draft.cover ? "#000" : theme.bg }} onClick={()=>fileRef.current?.click()}>
        {draft.cover
          ? <img src={draft.cover} alt="cover" style={S.coverImg} />
          : <><div style={S.heroGlow} /><div style={S.coverEditHint}>＋<div style={S.coverEditSub}>Upload cover photo</div></div></>}
        <div style={S.coverEditBadge}>{draft.cover ? "Change photo" : "Recommended 1:1"}</div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onCover} />

      <label style={S.lbl}>Or pick a theme (used if no photo)</label>
      <div style={S.themeRow}>
        {THEMES.map((t)=>(
          <button key={t.id} onClick={()=>up("theme", t.id)}
            style={{ ...S.themeSwatch, background:t.bg, outline: draft.theme===t.id?`2px solid ${t.accent}`:"2px solid transparent" }}>
            <span style={S.themeName}>{t.name}</span>
          </button>
        ))}
      </div>

      <label style={S.lbl}>Event name</label>
      <input className="field" value={draft.title} onChange={(e)=>up("title", e.target.value)} />
      <label style={S.lbl}>Tagline</label>
      <input className="field" value={draft.tagline} onChange={(e)=>up("tagline", e.target.value)} />
      <label style={S.lbl}>When</label>
      <input className="field" value={draft.date} onChange={(e)=>up("date", e.target.value)} />
      <label style={S.lbl}>Venue</label>
      <input className="field" value={draft.venue} onChange={(e)=>up("venue", e.target.value)} />
      <label style={S.lbl}>Dress code</label>
      <input className="field" value={draft.dress} onChange={(e)=>up("dress", e.target.value)} />

      <button className="prim wide" style={{ marginTop:18 }} onClick={()=>{ setEvent(draft); onDone(); }}>Publish invite</button>
    </div>
  );
}

// ── PROFILE — photo + a LOG of dinners attended (revisitable) ──
function ProfilePage({ me, setMe, log, onOpen, onBack }) {
  const fileRef = useRef(null);
  const onFile = (e)=>{ const f=e.target.files?.[0]; if(f) setMe((m)=>({ ...m, photo: URL.createObjectURL(f) })); };

  return (
    <div className="fade">
      <div style={S.flowHead}>
        <button className="ghosticon" onClick={onBack}>←</button>
        <div style={S.hostHeadTitle}>Your profile</div>
        <div style={{ width:34 }} />
      </div>

      <div style={S.profTop}>
        <button style={S.photoBtn} onClick={()=>fileRef.current?.click()}>
          {me?.photo ? <img src={me.photo} alt="you" style={S.photoImg} /> : <span style={S.photoPlus}>＋<span style={S.photoPlusSub}>Add photo</span></span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <div style={S.profName}>{me?.name || "You"}</div>
        <div style={S.profPhone}>{log.length} dinners · since 2025</div>
      </div>

      <div style={S.logHead}>Your table history</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {log.map((d)=>{
          const t = THEMES.find(x=>x.id===d.theme) || THEMES[0];
          return (
            <button key={d.id} className="logrow" onClick={()=>onOpen(d)}>
              <div style={{ ...S.logThumb, background: d.cover ? "#000" : t.bg }}>
                {d.cover ? <img src={d.cover} alt="" style={S.coverImg} /> : <span style={{ fontSize:22 }}>🍷</span>}
              </div>
              <div style={{ flex:1, textAlign:"left" }}>
                <div style={S.logTitle}>{d.title}</div>
                <div style={S.logMeta}>{d.date} · {d.venue}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ ...S.logBadge, color: d.went==="Going"?t.accent:C.faint }}>{d.went}</div>
                <div style={S.logCount}>{d.count} went</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PAST DINNER — revisit an old event page ──
function PastDinner({ dinner, onBack }) {
  const t = THEMES.find(x=>x.id===dinner.theme) || THEMES[0];
  return (
    <div className="fade" style={{ background:t.bg, margin:-22, marginTop:-52, padding:"52px 22px 32px", minHeight:"100%" }}>
      <div style={S.flowHead}>
        <button className="ghosticon" onClick={onBack}>←</button>
        <div style={{ ...S.hostHeadTitle, color:C.cream }}>Looking back</div>
        <div style={{ width:34 }} />
      </div>
      <Cover event={dinner} theme={t} />
      <div style={{ ...S.eyebrow, color:t.accent, marginTop:16 }}>{dinner.went === "Going" ? "UPCOMING" : "YOU WERE THERE"}</div>
      <h1 style={S.eventTitle}>{dinner.title}</h1>
      <p style={S.eventTag}>{dinner.date} · {dinner.venue}</p>

      <div style={{ ...S.card, marginTop:18 }}>
        <div style={S.cardTitle}>{dinner.count} at the table</div>
        <div style={{ ...S.avatarWrap, marginTop:12 }}>
          {SEED_GUESTS.slice(0, Math.min(6, dinner.count)).map((g)=><Ava key={g.name} {...g} />)}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>The album</div>
        <p style={S.mutedSm}>{dinner.went==="Going" ? "Photos will appear after the night." : "The night, as it happened."}</p>
        <div style={S.albumGrid}>
          {(dinner.went==="Going" ? [] : ["🍽️","🥂","🕯️","🍷","🫖","🍰"]).map((e,i)=>(
            <div key={i} style={{ ...S.albumBig, background:["#3A2226","#4A3320","#2E3A2C","#40252E","#463A22","#2C2430"][i] }}>{e}</div>
          ))}
          {dinner.went==="Going" && <div style={{ ...S.albumBig, background:"rgba(255,255,255,0.04)", color:C.faint, fontSize:13 }}>Soon</div>}
        </div>
      </div>
    </div>
  );
}

// ── small components ──
const Q = ({ children }) => <h2 style={S.q}>{children}</h2>;
const Sub = ({ children }) => <p style={S.qsub}>{children}</p>;
const SubLabel = ({ children }) => <div style={S.subLabel}>{children}</div>;

function Chips({ items, sel, onTog, danger, accent }) {
  return (
    <div style={S.chipWrap}>
      {items.map((it)=>{ const on=sel.includes(it);
        return (
          <button key={it} className="chip" onClick={()=>onTog(it)}
            style={{ background:on?(danger?"#4A1E1E":C.burgundy):"transparent",
              borderColor:on?(danger?C.rose:accent||C.gold):"rgba(243,233,221,0.18)",
              color:on?C.cream:C.dim }}>{it}</button>
        );
      })}
    </div>
  );
}

function Detail({ icon, k, v, sub, locked, accent }) {
  return (
    <div style={S.detailRow}>
      <div style={S.detailIcon}>{icon}</div>
      <div>
        <div style={S.detailK}>{k}</div>
        <div style={{ ...S.detailV, color:accent||C.cream }}>{v}</div>
        {sub && <div style={{ ...S.detailSub, color:locked?C.faint:C.dim }}>{locked&&"🔒 "}{sub}</div>}
      </div>
    </div>
  );
}

function Ava({ name, i, tint, dark }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ ...S.ava, background:tint, color:dark?C.ink:C.cream }}>{i}</div>
      <div style={S.avaName}>{name}</div>
    </div>
  );
}

function NavBtn({ label, icon, active, onClick, big }) {
  return (
    <button onClick={onClick} style={{ ...S.navBtn, opacity:active?1:0.5 }}>
      <div style={{ ...S.navIcon, ...(big?S.navBig:{}) }}>{icon}</div>
      <div style={S.navLabel}>{label}</div>
    </button>
  );
}

// ── styles ──
const S = {
  stage:{ minHeight:"100vh", background:"#080506", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 16px", fontFamily:"Georgia, serif" },
  phone:{ position:"relative", width:392, maxWidth:"100%", height:800, borderRadius:44, overflow:"hidden", boxShadow:"0 50px 130px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(217,161,91,0.1)" },
  notch:{ position:"absolute", top:12, left:"50%", transform:"translateX(-50%)", width:120, height:26, background:"rgba(0,0,0,0.55)", borderRadius:20, zIndex:20 },
  scroll:{ height:"100%", overflowY:"auto", padding:"52px 22px 96px", display:"flex", flexDirection:"column" },
  hint:{ color:"#5E5248", fontSize:13, marginTop:20, maxWidth:392, textAlign:"center", lineHeight:1.55, fontFamily:"system-ui, sans-serif" },

  loginWrap:{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center" },
  brandBig:{ color:C.cream, fontSize:52, fontStyle:"italic", letterSpacing:0.5 },
  brandSub:{ color:C.dim, fontSize:15, marginTop:6, fontFamily:"system-ui, sans-serif" },
  lbl:{ color:C.faint, fontSize:12, letterSpacing:1, fontWeight:600, fontFamily:"system-ui, sans-serif", display:"block", margin:"18px 0 8px" },
  legal:{ color:"#5E5248", fontSize:12, marginTop:14, fontFamily:"system-ui, sans-serif", lineHeight:1.5 },

  cover:{ height:300, borderRadius:24, position:"relative", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" },
  coverSm:{ height:180, borderRadius:20, position:"relative", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" },
  coverImg:{ width:"100%", height:"100%", objectFit:"cover" },
  heroGlow:{ position:"absolute", top:-60, left:"50%", transform:"translateX(-50%)", width:280, height:280, background:"radial-gradient(circle, rgba(255,255,255,0.16), transparent 65%)" },
  heroEmoji:{ fontSize:72, filter:"drop-shadow(0 8px 20px rgba(0,0,0,0.4))" },
  eyebrow:{ fontSize:11, letterSpacing:2.5, fontWeight:600, fontFamily:"system-ui, sans-serif", marginBottom:10 },
  eventTitle:{ color:C.cream, fontSize:38, lineHeight:1.05, margin:0, fontWeight:400, letterSpacing:-0.5 },
  eventTag:{ color:C.dim, fontSize:16, marginTop:10, fontStyle:"italic", lineHeight:1.4 },

  detailList:{ display:"flex", flexDirection:"column", gap:2, margin:"18px 0" },
  detailRow:{ display:"flex", gap:14, padding:"12px 0", borderBottom:"1px solid rgba(243,233,221,0.08)", alignItems:"flex-start" },
  detailIcon:{ fontSize:18, width:22, textAlign:"center" },
  detailK:{ color:C.faint, fontSize:11, letterSpacing:1, fontWeight:600, fontFamily:"system-ui, sans-serif" },
  detailV:{ fontSize:15, marginTop:3, fontFamily:"system-ui, sans-serif", lineHeight:1.4 },
  detailSub:{ fontSize:13, marginTop:3, fontFamily:"system-ui, sans-serif" },

  card:{ background:"rgba(0,0,0,0.24)", border:"1px solid rgba(243,233,221,0.1)", borderRadius:22, padding:18, marginBottom:16, backdropFilter:"blur(4px)" },
  cardHead:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  cardTitle:{ color:C.cream, fontSize:18 },
  lockTag:{ color:C.dim, fontSize:12, fontFamily:"system-ui, sans-serif" },
  mutedSm:{ color:C.dim, fontSize:13, marginTop:4, marginBottom:12, fontFamily:"system-ui, sans-serif", lineHeight:1.5 },

  avatarWrap:{ display:"flex", flexWrap:"wrap", gap:10 },
  ava:{ width:46, height:46, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.14)" },
  avaName:{ color:C.dim, fontSize:11, marginTop:5, fontFamily:"system-ui, sans-serif" },
  blurWrap:{ position:"relative" },
  blurRow:{ display:"flex", gap:10, filter:"blur(7px)", opacity:0.7, pointerEvents:"none" },
  blurAva:{ width:46, height:46, borderRadius:"50%" },
  blurNote:{ color:C.dim, fontSize:13, textAlign:"center", marginTop:14, fontFamily:"system-ui, sans-serif" },

  albumRow:{ display:"flex", gap:8 },
  albumCell:{ width:60, height:60, borderRadius:12, background:"rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, opacity:0.5 },
  albumAdd:{ width:60, height:60, borderRadius:12, border:"1px dashed rgba(243,233,221,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:C.dim },
  albumGrid:{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 },
  albumBig:{ aspectRatio:"1", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 },

  rsvpDock:{ marginTop:"auto", paddingTop:8 },
  rsvpQ:{ color:C.cream, fontSize:20, textAlign:"center", marginBottom:14 },

  flowWrap:{ flex:1, display:"flex", flexDirection:"column" },
  flowHead:{ display:"flex", alignItems:"center", gap:12, marginBottom:24 },
  progTrack:{ flex:1, height:5, borderRadius:5, background:"rgba(255,255,255,0.1)", overflow:"hidden" },
  progFill:{ height:"100%", borderRadius:5, transition:"width .3s" },
  flowBody:{ flex:1, display:"flex", flexDirection:"column" },
  q:{ color:C.cream, fontSize:29, margin:0, fontWeight:400, letterSpacing:-0.4, lineHeight:1.15 },
  qsub:{ color:C.dim, fontSize:15, marginTop:10, lineHeight:1.5 },
  subLabel:{ color:C.dim, fontSize:14, margin:"22px 0 11px", letterSpacing:0.3 },
  chipWrap:{ display:"flex", flexWrap:"wrap", gap:9 },

  sliderBox:{ background:"rgba(0,0,0,0.24)", border:"1px solid rgba(243,233,221,0.1)", borderRadius:20, padding:"22px 18px" },
  sliderLabel:{ color:C.cream, fontSize:20, textAlign:"center", marginBottom:20, fontStyle:"italic" },
  sliderEnds:{ display:"flex", justifyContent:"space-between", color:C.faint, fontSize:12, marginTop:13, fontFamily:"system-ui, sans-serif" },

  hostHeadTitle:{ flex:1, textAlign:"center", color:C.cream, fontSize:17, fontStyle:"italic" },
  coverEdit:{ width:"100%", height:280, borderRadius:24, position:"relative", overflow:"hidden", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center", justifyContent:"center" },
  coverEditHint:{ color:C.cream, fontSize:34, display:"flex", flexDirection:"column", alignItems:"center", zIndex:2 },
  coverEditSub:{ fontSize:13, marginTop:6, fontFamily:"system-ui, sans-serif", opacity:0.85 },
  coverEditBadge:{ position:"absolute", bottom:12, right:12, background:"rgba(0,0,0,0.55)", color:C.cream, fontSize:11, padding:"5px 10px", borderRadius:20, fontFamily:"system-ui, sans-serif", zIndex:3 },

  themeRow:{ display:"flex", gap:10, overflowX:"auto", paddingBottom:6 },
  themeSwatch:{ minWidth:88, height:60, borderRadius:14, border:"none", cursor:"pointer", position:"relative", display:"flex", alignItems:"flex-end", padding:8 },
  themeName:{ color:C.cream, fontSize:11, fontFamily:"system-ui, sans-serif", textShadow:"0 1px 4px rgba(0,0,0,0.6)" },

  profTop:{ display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0 22px" },
  photoBtn:{ width:104, height:104, borderRadius:"50%", border:"2px dashed rgba(243,233,221,0.25)", background:"rgba(255,255,255,0.03)", cursor:"pointer", overflow:"hidden", padding:0 },
  photoImg:{ width:"100%", height:"100%", objectFit:"cover" },
  photoPlus:{ color:C.dim, fontSize:26, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%" },
  photoPlusSub:{ fontSize:11, marginTop:2, fontFamily:"system-ui, sans-serif" },
  profName:{ color:C.cream, fontSize:26, marginTop:14 },
  profPhone:{ color:C.faint, fontSize:13, marginTop:3, fontFamily:"system-ui, sans-serif" },

  logHead:{ color:C.faint, fontSize:12, letterSpacing:1.5, fontWeight:600, fontFamily:"system-ui, sans-serif", margin:"6px 0 14px" },
  logThumb:{ width:56, height:56, borderRadius:14, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  logTitle:{ color:C.cream, fontSize:16 },
  logMeta:{ color:C.dim, fontSize:12, marginTop:3, fontFamily:"system-ui, sans-serif" },
  logBadge:{ fontSize:13, fontFamily:"system-ui, sans-serif" },
  logCount:{ color:C.faint, fontSize:11, marginTop:2, fontFamily:"system-ui, sans-serif" },

  nav:{ position:"absolute", bottom:0, left:0, right:0, height:76, background:"rgba(10,6,7,0.82)", backdropFilter:"blur(12px)", borderTop:"1px solid rgba(243,233,221,0.1)", display:"flex", alignItems:"center", justifyContent:"space-around", zIndex:15 },
  navBtn:{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 },
  navIcon:{ color:C.cream, fontSize:20 },
  navBig:{ width:40, height:40, borderRadius:"50%", background:C.burgundy, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 },
  navLabel:{ color:C.dim, fontSize:11, fontFamily:"system-ui, sans-serif" },
};

const CSS = `
  .fade { animation: f .4s ease; display:flex; flex-direction:column; flex:1; }
  @keyframes f { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  .prim { background:${C.burgundy}; color:${C.cream}; border:none; padding:15px; border-radius:16px; font-size:16px; font-family:Georgia,serif; cursor:pointer; transition:all .2s; box-shadow:0 10px 32px rgba(92,26,27,0.42); }
  .prim:hover { background:${C.burgundyLit}; transform:translateY(-1px); }
  .prim:disabled { opacity:.4; cursor:not-allowed; box-shadow:none; transform:none; }
  .prim.wide { width:100%; }
  .opt { background:rgba(0,0,0,0.2); color:${C.cream}; border:1px solid rgba(243,233,221,0.16); padding:15px; border-radius:16px; font-size:16px; font-family:Georgia,serif; cursor:pointer; transition:all .18s; text-align:left; }
  .opt:hover { border-color:rgba(243,233,221,0.4); }
  .opt.sel { border-color:${C.gold}; }
  .field { width:100%; box-sizing:border-box; background:rgba(0,0,0,0.24); border:1px solid rgba(243,233,221,0.16); border-radius:14px; padding:15px; color:${C.cream}; font-size:16px; font-family:Georgia,serif; outline:none; transition:border-color .2s; }
  .field:focus { border-color:${C.gold}; }
  .field::placeholder { color:#5E5248; }
  .field.code { letter-spacing:14px; text-align:center; font-size:26px; }
  .chip { border:1px solid; border-radius:20px; padding:9px 15px; font-size:14px; font-family:Georgia,serif; cursor:pointer; transition:all .18s; }
  .chip:hover { transform:translateY(-1px); }
  .ghosticon { background:none; border:none; color:${C.dim}; font-size:20px; cursor:pointer; width:34px; height:34px; }
  .ghosticon:hover { color:${C.cream}; }
  .logrow { display:flex; align-items:center; gap:14px; background:rgba(0,0,0,0.24); border:1px solid rgba(243,233,221,0.1); border-radius:18px; padding:12px; cursor:pointer; transition:all .18s; }
  .logrow:hover { border-color:rgba(243,233,221,0.3); transform:translateY(-1px); }
  .slider { -webkit-appearance:none; width:100%; height:5px; border-radius:5px; outline:none; }
  .slider::-webkit-slider-thumb { -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:${C.cream}; cursor:pointer; border:3px solid ${C.gold}; box-shadow:0 2px 10px rgba(0,0,0,0.5); }
  .slider::-moz-range-thumb { width:26px; height:26px; border-radius:50%; background:${C.cream}; cursor:pointer; border:3px solid ${C.gold}; }
  ::-webkit-scrollbar { width:0; }
`;
