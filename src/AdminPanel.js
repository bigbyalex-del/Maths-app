import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { collection, getDocs, deleteDoc, doc, setDoc } from "firebase/firestore";

// ── Change this to whatever you want your admin password to be ────────────────
const ADMIN_PASSWORD = "mathsmaster2024";

const flatLevelCount = 29; // total levels in curriculum

const PX = "'Press Start 2P', monospace";

// ── Helpers ───────────────────────────────────────────────────────────────────
function masteredCount(levelProgress) {
  if (!levelProgress) return 0;
  return Object.values(levelProgress).filter(p => p.state === "mastered").length;
}

function daysSince(dateStr) {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff}d ago`;
}

function maskPin(pin) {
  if (!pin || pin.length < 2) return "••••";
  return pin[0] + "•".repeat(pin.length - 1);
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function Pill({ label, value, color = "#6b7280" }) {
  return (
    <span style={{ display:"inline-flex", flexDirection:"column", alignItems:"center",
      background:"rgba(0,0,0,0.35)", border:`2px solid ${color}44`, padding:"4px 10px",
      marginRight:6, marginBottom:4, minWidth:60 }}>
      <span style={{ fontSize:13, fontWeight:900, color }}>{value}</span>
      <span style={{ fontSize:9, color:"#64748b", fontWeight:700, marginTop:1 }}>{label}</span>
    </span>
  );
}

// ── Account detail modal ──────────────────────────────────────────────────────
function AccountModal({ profile, onClose, onDelete, onResetProgress }) {
  const mastered = masteredCount(profile.levelProgress);
  const bossKillCount = Object.keys(profile.bossKills || {}).length;
  const [confirming, setConfirming] = useState(null); // "delete" | "reset"

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.8)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"#0d0d1a", border:"4px solid #4f46e5", boxShadow:"8px 8px 0 #000",
        padding:28, maxWidth:500, width:"100%", fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:4 }}>{profile.name}</div>
        <div style={{ fontSize:11, color:"#64748b", marginBottom:16 }}>PIN: {maskPin(profile.id)} · Last active: {daysSince(profile.lastCompletedDate)}</div>

        <div style={{ display:"flex", flexWrap:"wrap", marginBottom:16 }}>
          <Pill label="Questions" value={profile.totalQuestions ?? 0} color="#22c55e" />
          <Pill label="Mastered" value={`${mastered}/${flatLevelCount}`} color="#ffd700" />
          <Pill label="Streak" value={`${profile.streak ?? 0}d`} color="#f59e0b" />
          <Pill label="Best Streak" value={`${profile.bestStreak ?? 0}d`} color="#f97316" />
          <Pill label="Badges" value={profile.badges?.length ?? 0} color="#a855f7" />
          <Pill label="Boss Kills" value={bossKillCount} color="#ef4444" />
        </div>

        {/* Level progress breakdown */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", marginBottom:8 }}>LEVEL PROGRESS</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {Object.entries(profile.levelProgress || {}).map(([id, p]) => (
              <span key={id} style={{ fontSize:10, fontWeight:700, padding:"2px 7px",
                background: p.state==="mastered" ? "rgba(255,215,0,0.2)" : p.state==="speed" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.05)",
                border:`1px solid ${p.state==="mastered" ? "#ffd700" : p.state==="speed" ? "#f59e0b" : "#333"}`,
                color: p.state==="mastered" ? "#ffd700" : p.state==="speed" ? "#f59e0b" : "#64748b" }}>
                {id}
              </span>
            ))}
            {Object.keys(profile.levelProgress || {}).length === 0 && <span style={{ fontSize:11, color:"#475569" }}>No progress yet</span>}
          </div>
        </div>

        {/* Badges */}
        {profile.badges?.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", marginBottom:6 }}>BADGES EARNED</div>
            <div style={{ fontSize:11, color:"#e2e8f0", lineHeight:1.8 }}>{profile.badges.join(", ")}</div>
          </div>
        )}

        {/* Boss kills */}
        {bossKillCount > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", marginBottom:6 }}>BOSSES DEFEATED</div>
            <div style={{ fontSize:11, color:"#e2e8f0" }}>{Object.keys(profile.bossKills).join(", ")}</div>
          </div>
        )}

        {/* Actions */}
        {confirming ? (
          <div style={{ background:"rgba(239,68,68,0.12)", border:"2px solid #ef4444", padding:14, marginTop:8 }}>
            <div style={{ fontSize:12, fontWeight:800, color:"#ef4444", marginBottom:10 }}>
              {confirming === "delete" ? `Delete ${profile.name}'s account permanently?` : `Reset ${profile.name}'s progress? (keeps account)`}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { confirming === "delete" ? onDelete() : onResetProgress(); setConfirming(null); }}
                style={{ fontFamily:PX, fontSize:8, lineHeight:1.8, padding:"8px 16px", background:"#ef4444", border:"3px solid #111", cursor:"pointer", color:"#fff" }}>
                CONFIRM
              </button>
              <button onClick={() => setConfirming(null)}
                style={{ fontFamily:PX, fontSize:8, lineHeight:1.8, padding:"8px 16px", background:"#1e293b", border:"3px solid #475569", cursor:"pointer", color:"#94a3b8" }}>
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
            <button onClick={() => setConfirming("reset")}
              style={{ fontFamily:PX, fontSize:8, lineHeight:1.8, padding:"8px 14px", background:"rgba(245,158,11,0.15)", border:"3px solid #f59e0b", cursor:"pointer", color:"#f59e0b" }}>
              RESET PROGRESS
            </button>
            <button onClick={() => setConfirming("delete")}
              style={{ fontFamily:PX, fontSize:8, lineHeight:1.8, padding:"8px 14px", background:"rgba(239,68,68,0.15)", border:"3px solid #ef4444", cursor:"pointer", color:"#ef4444" }}>
              DELETE ACCOUNT
            </button>
            <button onClick={onClose}
              style={{ fontFamily:PX, fontSize:8, lineHeight:1.8, padding:"8px 14px", background:"#1e293b", border:"3px solid #475569", cursor:"pointer", color:"#94a3b8", marginLeft:"auto" }}>
              CLOSE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main admin panel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [authed, setAuthed]         = useState(false);
  const [pwInput, setPwInput]       = useState("");
  const [pwError, setPwError]       = useState(false);
  const [profiles, setProfiles]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState(null);
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState("lastActive"); // lastActive | questions | mastered | name

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "profiles"));
      // Each Firestore doc is a household: { appSettings, profiles: { pinId: { name, ... } } }
      const data = [];
      snap.docs.forEach(d => {
        const docData = d.data();
        const nestedProfiles = docData.profiles;
        if (nestedProfiles && typeof nestedProfiles === "object") {
          Object.entries(nestedProfiles).forEach(([profileId, profile]) => {
            data.push({ ...profile, id: profileId, _docId: d.id });
          });
        } else {
          // Flat structure fallback
          data.push({ id: d.id, _docId: d.id, ...docData });
        }
      });
      setProfiles(data);
    } catch (e) {
      console.error("Failed to fetch profiles:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) fetchProfiles(); }, [authed, fetchProfiles]);

  const handleLogin = () => {
    if (pwInput === ADMIN_PASSWORD) { setAuthed(true); setPwError(false); }
    else { setPwError(true); setPwInput(""); }
  };

  const handleDelete = async (profileId) => {
    await deleteDoc(doc(db, "profiles", profileId));
    setSelected(null);
    await fetchProfiles();
  };

  const handleResetProgress = async (profile) => {
    const reset = { ...profile, levelProgress: {}, badges: [], totalQuestions: 0,
      streak: 0, bestStreak: 0, lastCompletedDate: "", history: [],
      consecutivePerfects: 0, bossKills: {}, placementDone: false };
    await setDoc(doc(db, "profiles", profile.id), reset);
    setSelected(null);
    await fetchProfiles();
  };

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight:"100vh", background:"#07080f", display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"#0d0d1a", border:"4px solid #4f46e5", boxShadow:"8px 8px 0 #000",
        padding:40, maxWidth:380, width:"100%", textAlign:"center" }}>
        <div style={{ fontFamily:PX, fontSize:12, color:"#ffd700", lineHeight:1.8, marginBottom:8 }}>Admin Panel</div>
        <div style={{ fontSize:13, color:"#64748b", fontWeight:700, marginBottom:24 }}>Maths App — Owner Access</div>
        <input
          type="password"
          placeholder="Admin password"
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setPwError(false); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ width:"100%", padding:"12px 16px", fontSize:14, fontWeight:700,
            background:"#0a0a1a", border:`3px solid ${pwError ? "#ef4444" : "#4f46e5"}`,
            color:"#f1f5f9", outline:"none", boxSizing:"border-box", marginBottom:8 }}
          autoFocus
        />
        {pwError && <div style={{ fontSize:12, color:"#ef4444", fontWeight:700, marginBottom:8 }}>Incorrect password</div>}
        <button onClick={handleLogin}
          style={{ width:"100%", fontFamily:PX, fontSize:9, lineHeight:1.8, padding:"12px",
            background:"#4f46e5", border:"3px solid #111", boxShadow:"4px 4px 0 #000",
            cursor:"pointer", color:"#fff", marginTop:4 }}>
          LOGIN
        </button>
      </div>
    </div>
  );

  // ── Sort & filter ─────────────────────────────────────────────────────────
  const filtered = profiles
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "lastActive") return new Date(b.lastCompletedDate || 0) - new Date(a.lastCompletedDate || 0);
      if (sortBy === "questions")  return (b.totalQuestions ?? 0) - (a.totalQuestions ?? 0);
      if (sortBy === "mastered")   return masteredCount(b.levelProgress) - masteredCount(a.levelProgress);
      if (sortBy === "name")       return (a.name ?? "").localeCompare(b.name ?? "");
      return 0;
    });

  const totalQ    = profiles.reduce((s, p) => s + (p.totalQuestions ?? 0), 0);
  const avgStreak = profiles.length ? Math.round(profiles.reduce((s, p) => s + (p.streak ?? 0), 0) / profiles.length) : 0;
  const activeToday = profiles.filter(p => p.lastCompletedDate === new Date().toISOString().slice(0,10)).length;

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#07080f", fontFamily:"'Nunito',sans-serif", color:"#f1f5f9" }}>
      {/* Header */}
      <div style={{ background:"#0d0d1a", borderBottom:"3px solid #4f46e5", padding:"16px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", lineHeight:1.8 }}>Admin Panel</div>
          <div style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Maths App — Owner Dashboard</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={fetchProfiles}
            style={{ fontFamily:PX, fontSize:7, lineHeight:1.8, padding:"6px 14px",
              background:"rgba(79,70,229,0.2)", border:"2px solid #4f46e5", cursor:"pointer", color:"#818cf8" }}>
            ↻ REFRESH
          </button>
          <button onClick={() => { setAuthed(false); setPwInput(""); }}
            style={{ fontFamily:PX, fontSize:7, lineHeight:1.8, padding:"6px 14px",
              background:"rgba(239,68,68,0.1)", border:"2px solid #ef4444", cursor:"pointer", color:"#ef4444" }}>
            LOGOUT
          </button>
        </div>
      </div>

      <div style={{ padding:"20px 24px", maxWidth:1100, margin:"0 auto" }}>
        {/* Summary stats */}
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
          {[
            { label:"Total Accounts", value:profiles.length, color:"#4f46e5" },
            { label:"Active Today",   value:activeToday,      color:"#22c55e" },
            { label:"Total Questions",value:totalQ.toLocaleString(), color:"#f59e0b" },
            { label:"Avg Streak",     value:`${avgStreak}d`,  color:"#06b6d4" },
          ].map(s => (
            <div key={s.label} style={{ flex:"1 1 160px", background:"#0d0d1a",
              border:`3px solid ${s.color}44`, boxShadow:`4px 4px 0 ${s.color}22`, padding:"14px 18px" }}>
              <div style={{ fontSize:26, fontWeight:900, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search & sort */}
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex:"1 1 200px", padding:"8px 14px", fontSize:13, fontWeight:700,
              background:"#0d0d1a", border:"2px solid #334155", color:"#f1f5f9", outline:"none" }}
          />
          <div style={{ display:"flex", gap:6 }}>
            {[["lastActive","Last Active"],["questions","Questions"],["mastered","Mastered"],["name","Name"]].map(([key,label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                style={{ fontFamily:PX, fontSize:7, lineHeight:1.8, padding:"6px 10px", cursor:"pointer",
                  background: sortBy===key ? "rgba(79,70,229,0.3)" : "transparent",
                  border:`2px solid ${sortBy===key ? "#4f46e5" : "#334155"}`,
                  color: sortBy===key ? "#818cf8" : "#64748b" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Account list */}
        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:"#64748b", fontFamily:PX, fontSize:9 }}>LOADING…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#64748b", fontSize:13, fontWeight:700 }}>
            {profiles.length === 0 ? "No accounts found." : "No accounts match your search."}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(profile => {
              const mastered = masteredCount(profile.levelProgress);
              const masteredPct = Math.round((mastered / flatLevelCount) * 100);
              const bossKills = Object.keys(profile.bossKills || {}).length;
              return (
                <div key={profile.id}
                  onClick={() => setSelected(profile)}
                  style={{ background:"#0d0d1a", border:"2px solid #1e293b",
                    padding:"14px 18px", cursor:"pointer", display:"flex",
                    alignItems:"center", gap:16, flexWrap:"wrap",
                    transition:"border-color 0.15s",
                    borderColor: selected?.id === profile.id ? "#4f46e5" : "#1e293b" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="#4f46e5"}
                  onMouseLeave={e => e.currentTarget.style.borderColor= selected?.id===profile.id ? "#4f46e5" : "#1e293b"}>

                  {/* Avatar letter */}
                  <div style={{ width:40, height:40, background:"#4f46e533", border:"2px solid #4f46e5",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    fontFamily:PX, fontSize:12, color:"#818cf8" }}>
                    {(profile.name?.[0] ?? "?").toUpperCase()}
                  </div>

                  {/* Name & PIN */}
                  <div style={{ flex:"1 1 120px", minWidth:0 }}>
                    <div style={{ fontWeight:900, fontSize:14, color:"#f1f5f9", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{profile.name || "Unnamed"}</div>
                    <div style={{ fontSize:11, color:"#475569", fontWeight:700 }}>PIN: {maskPin(profile.id)}</div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ flex:"2 1 180px", minWidth:140 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontWeight:700, color:"#64748b", marginBottom:3 }}>
                      <span>Mastery</span><span>{mastered}/{flatLevelCount}</span>
                    </div>
                    <div style={{ height:8, background:"#1e293b", overflow:"hidden" }}>
                      <div style={{ width:`${masteredPct}%`, height:"100%", background:"#ffd700", transition:"width 0.3s" }} />
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display:"flex", gap:16, flexShrink:0 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:15, fontWeight:900, color:"#22c55e" }}>{(profile.totalQuestions ?? 0).toLocaleString()}</div>
                      <div style={{ fontSize:9, color:"#475569", fontWeight:700 }}>Questions</div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:15, fontWeight:900, color:"#f59e0b" }}>{profile.streak ?? 0}d</div>
                      <div style={{ fontSize:9, color:"#475569", fontWeight:700 }}>Streak</div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:15, fontWeight:900, color:"#a855f7" }}>{profile.badges?.length ?? 0}</div>
                      <div style={{ fontSize:9, color:"#475569", fontWeight:700 }}>Badges</div>
                    </div>
                    {bossKills > 0 && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:15, fontWeight:900, color:"#ef4444" }}>{bossKills}</div>
                        <div style={{ fontSize:9, color:"#475569", fontWeight:700 }}>Bosses</div>
                      </div>
                    )}
                  </div>

                  {/* Last active */}
                  <div style={{ fontSize:11, fontWeight:700, color:"#475569", flexShrink:0, textAlign:"right" }}>
                    {daysSince(profile.lastCompletedDate)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <AccountModal
          profile={selected}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected.id)}
          onResetProgress={() => handleResetProgress(selected)}
        />
      )}
    </div>
  );
}
