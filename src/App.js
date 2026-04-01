
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const STORAGE_KEY = "maths-app-v3";
const QUESTIONS_PER_SHEET = 36;
const ACCURACY_THRESHOLD = 95;   // % needed to pass each phase
const SPEED_PASSES_NEEDED = 3;    // consecutive speed passes to master a level
const REVIEW_Q_COUNT = 9;         // review questions mixed in during speed phase
const DEFAULT_APP_SETTINGS = { parentPin: "1234", hasUnlockedSettingsOnce: false };

// ── Level states ──────────────────────────────────────────────────────────────
const LS = { LOCKED: "locked", ACCURACY: "accuracy", SPEED: "speed", MASTERED: "mastered" };

// ── Curriculum ────────────────────────────────────────────────────────────────
// Research: small steps, accuracy-first, then speed. masteryTime = seconds for 36 Qs.
// Based on benchmarks: ~30 correct/min (Grade 3) → 36q = ~72s easy facts,
// scaling up to ~3min for complex operations.
const CURRICULUM = [
  { id: "foundations", name: "Addition Foundations", color: "#22c55e", tip: "Count up from the bigger number in your head — don't start from zero!", levels: [
    { id: "add-1",     title: "+1 facts",      skill: "Any number + 1",           masteryTime: 80,  gen: (i) => ({ a: (i % 9) + 1, b: 1, op: "+" }) },
    { id: "add-2",     title: "+2 facts",      skill: "Any number + 2",           masteryTime: 85,  gen: (i) => ({ a: (i % 9) + 1, b: 2, op: "+" }) },
    { id: "add-3",     title: "+3 facts",      skill: "Any number + 3",           masteryTime: 90,  gen: (i) => ({ a: (i % 9) + 1, b: 3, op: "+" }) },
    { id: "doubles",   title: "Doubles",       skill: "2+2, 3+3, 4+4…",          masteryTime: 85,  gen: (i) => ({ a: (i % 9) + 1, b: (i % 9) + 1, op: "+" }) },
    { id: "add-mix-10",title: "Mixed to 10",   skill: "Switch between facts",     masteryTime: 100, gen: (i) => { const p=[[9,1],[8,2],[7,3],[6,2],[5,3],[4,1],[3,2],[2,3],[6,4],[5,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "make-10",   title: "Make 10",       skill: "Bridging to 10",           masteryTime: 110, gen: (i) => { const p=[[8,4],[9,5],[7,6],[6,7],[8,5],[9,4],[7,5],[6,6],[5,7],[4,8]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
  ]},
  { id: "add-20", name: "Addition to 20", color: "#3b82f6", tip: "Break numbers into tens and ones — 13+4 means 10+3+4. Do the ones first!", levels: [
    { id: "add-teen-1", title: "Teen + 1/2",   skill: "11+1, 14+2 …",            masteryTime: 100, gen: (i) => { const p=[[10,1],[11,2],[12,1],[13,2],[14,1],[15,2],[16,1],[17,2],[10,2],[11,1]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "add-teen-3", title: "Teen + 3/4",   skill: "12+3, 14+4 …",            masteryTime: 110, gen: (i) => { const p=[[10,3],[11,4],[12,3],[13,4],[14,3],[15,4],[16,3],[17,4],[10,4],[12,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "near-double",title: "Near doubles", skill: "3+4, 5+6, 7+8 …",         masteryTime: 110, gen: (i) => { const p=[[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[2,3],[1,2],[4,3],[6,5]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "add-mix-20", title: "Mixed to 20",  skill: "Fluent addition to 20",   masteryTime: 130, gen: (i) => { const p=[[12,5],[13,4],[14,3],[15,2],[16,1],[9,6],[8,7],[11,5],[7,8],[6,9]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
  ]},
  { id: "subtraction", name: "Subtraction", color: "#8b5cf6", tip: "Think of it as 'how many do I need to add to the small number to reach the big one?'", levels: [
    { id: "sub-1",      title: "− 1 / − 2",    skill: "Simple subtraction",       masteryTime: 100, gen: (i) => { const p=[[5,1],[6,2],[7,1],[8,2],[9,1],[10,2],[11,1],[12,2],[8,1],[9,2]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
    { id: "sub-3",      title: "− 3 / − 4",    skill: "Larger subtraction jumps", masteryTime: 110, gen: (i) => { const p=[[8,3],[9,4],[10,3],[11,4],[12,3],[13,4],[14,3],[15,4],[9,3],[10,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
    { id: "sub-bridge", title: "Bridge 10",    skill: "Crossing 10 backwards",    masteryTime: 125, gen: (i) => { const p=[[12,5],[13,6],[14,7],[15,8],[16,7],[17,8],[11,4],[12,7],[13,5],[14,6]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
    { id: "sub-mix-20", title: "Mixed sub 20", skill: "Fluent subtraction to 20", masteryTime: 140, gen: (i) => { const p=[[18,9],[17,8],[16,7],[15,6],[14,5],[13,4],[12,3],[11,2],[19,8],[20,7]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
  ]},
  { id: "place-value", name: "Place Value", color: "#f59e0b", tip: "Tens digit goes up by 1 for '+10', down by 1 for '−10'. The ones digit stays the same!", levels: [
    { id: "pv-10",      title: "10 more/less",  skill: "Jump a whole ten",        masteryTime: 110, gen: (i) => { const ns=[12,14,25,31,46,57,63,78,84,22,37,53]; return{a:ns[i%ns.length],b:i%2===0?10:-10,op:"+"}; } },
    { id: "pv-add-10s", title: "Add tens",      skill: "14+20, 35+30 …",         masteryTime: 120, gen: (i) => { const ns=[14,23,35,41,52,67,74,86,31,43]; const ts=[10,20,30]; return{a:ns[i%ns.length],b:ts[i%ts.length],op:"+"}; } },
    { id: "pv-sub-10s", title: "Subtract tens", skill: "64−20, 87−30 …",         masteryTime: 120, gen: (i) => { const ns=[34,43,55,61,72,87,94,76,58,65]; const ts=[10,20,30]; return{a:ns[i%ns.length],b:ts[i%ts.length],op:"-"}; } },
  ]},
  { id: "ops-100", name: "Add & Subtract to 100", color: "#ef4444", tip: "Add/subtract the tens first, then deal with the ones separately.", levels: [
    { id: "add-no-carry",  title: "Add (no carry)",    skill: "21+34, 42+25 …",   masteryTime: 140, gen: (i) => { const p=[[21,34],[42,25],[53,16],[34,45],[61,28],[72,17],[43,26],[51,38],[24,35],[32,47]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "add-carry",     title: "Add (with carry)",  skill: "27+18, 36+27 …",   masteryTime: 155, gen: (i) => { const p=[[27,18],[36,27],[48,16],[59,14],[28,35],[47,26],[38,25],[67,18],[49,23],[56,37]]; const [a,b]=p[i%p.length]; return{a,b,op:"+"}; } },
    { id: "sub-no-borrow", title: "Sub (no borrow)",   skill: "54−22, 76−34 …",   masteryTime: 140, gen: (i) => { const p=[[54,22],[76,34],[83,41],[65,23],[97,45],[88,36],[79,43],[68,25],[57,32],[96,54]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
    { id: "sub-borrow",    title: "Sub (with borrow)", skill: "52−27, 71−38 …",   masteryTime: 155, gen: (i) => { const p=[[52,27],[71,38],[63,26],[84,47],[92,58],[60,24],[73,38],[81,46],[54,37],[62,28]]; const [a,b]=p[i%p.length]; return{a,b,op:"-"}; } },
    { id: "mixed-100",     title: "Mixed to 100",      skill: "Choose the operation",masteryTime:165, gen: (i) => { const p=[[36,27,"+"],[84,29,"-"],[48,35,"+"],[73,18,"-"],[27,46,"+"],[92,37,"-"],[55,28,"+"],[67,39,"-"]]; const [a,b,op]=p[i%p.length]; return{a,b,op}; } },
  ]},
  { id: "multiplication", name: "Multiplication", color: "#06b6d4", tip: "Picture equal rows of objects — 3×4 is 3 rows with 4 in each row.", levels: [
    { id: "times-2",     title: "×2 table",     skill: "Doubles — 2×1 to 2×12",  masteryTime: 90,  gen: (i) => ({ a: 2, b: (i % 12) + 1, op: "×" }) },
    { id: "times-5",     title: "×5 table",     skill: "Fives — 5×1 to 5×12",   masteryTime: 90,  gen: (i) => ({ a: 5, b: (i % 12) + 1, op: "×" }) },
    { id: "times-10",    title: "×10 table",    skill: "Tens — 10×1 to 10×12",  masteryTime: 85,  gen: (i) => ({ a: 10, b: (i % 12) + 1, op: "×" }) },
    { id: "times-3-4",   title: "×3 and ×4",   skill: "Core fact recall",       masteryTime: 125, gen: (i) => { const p=[[3,4],[4,6],[3,8],[4,7],[3,9],[4,8],[3,6],[4,5],[3,7],[4,9],[3,3],[4,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"×"}; } },
    { id: "times-6-7",   title: "×6 and ×7",   skill: "Harder fact recall",     masteryTime: 145, gen: (i) => { const p=[[6,4],[7,6],[6,8],[7,7],[6,9],[7,8],[6,6],[7,5],[6,7],[7,9],[6,3],[7,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"×"}; } },
    { id: "times-8-9",   title: "×8 and ×9",   skill: "Full fact fluency",      masteryTime: 155, gen: (i) => { const p=[[8,4],[9,6],[8,7],[9,8],[8,9],[9,7],[8,6],[9,5],[8,8],[9,9],[8,3],[9,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"×"}; } },
    { id: "times-mixed",  title: "All tables",  skill: "All × tables mixed",     masteryTime: 165, gen: (i) => { const p=[[3,7],[4,8],[6,6],[7,8],[9,4],[8,7],[5,9],[2,12],[6,9],[7,6],[8,5],[9,3]]; const [a,b]=p[i%p.length]; return{a,b,op:"×"}; } },
  ]},
  { id: "division", name: "Division", color: "#14b8a6", tip: "Ask yourself: 'how many groups of [small number] fit into [big number]?'", levels: [
    { id: "div-2-5-10",  title: "÷2, ÷5, ÷10", skill: "Easy division facts",    masteryTime: 110, gen: (i) => { const p=[[10,2],[20,5],[30,10],[16,2],[25,5],[50,10],[14,2],[15,5],[40,10],[18,2]]; const [a,b]=p[i%p.length]; return{a,b,op:"÷"}; } },
    { id: "div-3-4",     title: "÷3 and ÷4",   skill: "Inverse of ×3 and ×4",  masteryTime: 130, gen: (i) => { const p=[[12,3],[16,4],[24,3],[28,4],[27,3],[32,4],[21,3],[36,4],[18,3],[20,4]]; const [a,b]=p[i%p.length]; return{a,b,op:"÷"}; } },
    { id: "div-facts",   title: "All ÷ facts",  skill: "Full division recall",   masteryTime: 150, gen: (i) => { const p=[[32,4],[45,5],[54,6],[49,7],[72,8],[81,9],[42,6],[63,7],[56,8],[72,9],[48,6],[56,7]]; const [a,b]=p[i%p.length]; return{a,b,op:"÷"}; } },
    { id: "mult-div",    title: "× and ÷ mix",  skill: "Operation flexibility",  masteryTime: 165, gen: (i) => { const p=[[8,7,"×"],[56,8,"÷"],[9,6,"×"],[54,9,"÷"],[7,8,"×"],[42,6,"÷"],[6,9,"×"],[48,8,"÷"],[5,7,"×"],[35,5,"÷"]]; const [a,b,op]=p[i%p.length]; return{a,b,op}; } },
  ]},
];

const flatLevels = CURRICULUM.flatMap(s => s.levels.map(l => ({ ...l, sectionId: s.id, sectionName: s.name, sectionColor: s.color, sectionTip: s.tip })));

// ── Maths helpers ─────────────────────────────────────────────────────────────
function computeAnswer(a, b, op) {
  if (op === "+") return String(a + b);
  if (op === "-") return String(a - b);
  if (op === "×") return String(a * b);
  if (op === "÷") return String(Math.round((a / b) * 10) / 10);
  return "";
}

function normalizeAnswer(v) { return String(v).trim().replace(/\s+/g, "").toLowerCase(); }

// Build worksheet: accuracy phase = 36 from current level
// Speed phase = 27 from current + 9 interleaved from mastered levels (retrieval + interleaving research)
function buildProblems(levelId, masteredIds = [], isSpeedPhase = false) {
  const level = flatLevels.find(l => l.id === levelId) || flatLevels[0];
  const useReview = isSpeedPhase && masteredIds.length >= 1;
  const mainCount = useReview ? QUESTIONS_PER_SHEET - REVIEW_Q_COUNT : QUESTIONS_PER_SHEET;

  const main = Array.from({ length: mainCount }, (_, i) => {
    const { a, b, op } = level.gen(i);
    return { a, b, op, answer: computeAnswer(a, b, op), isReview: false };
  });

  if (!useReview) return main;

  // Pick review questions from up to 3 most-recently-mastered levels
  const reviewLevels = masteredIds.slice(-3).map(id => flatLevels.find(l => l.id === id)).filter(Boolean);
  const review = Array.from({ length: REVIEW_Q_COUNT }, (_, i) => {
    const rl = reviewLevels[i % reviewLevels.length];
    const { a, b, op } = rl.gen(80 + i);
    return { a, b, op, answer: computeAnswer(a, b, op), isReview: true, reviewTitle: rl.title };
  });

  // Interleave: every ~3rd problem after Q6 is a review question
  const result = [];
  let mi = 0, ri = 0;
  for (let i = 0; i < QUESTIONS_PER_SHEET; i++) {
    const isReviewSlot = ri < review.length && i >= 5 && (i - 5) % 3 === 2;
    if (isReviewSlot) result.push(review[ri++]);
    else if (mi < main.length) result.push(main[mi++]);
  }
  while (result.length < QUESTIONS_PER_SHEET && mi < main.length) result.push(main[mi++]);
  return result;
}

// ── Level progress logic ──────────────────────────────────────────────────────
// prog shape: { accuracyUnlocked, speedPasses, mastered, bestTime, bestAccuracy, attempts }
function getLevelState(levelId, levelProgress) {
  const idx = flatLevels.findIndex(l => l.id === levelId);
  const prog = levelProgress[levelId] || {};
  if (idx > 0) {
    const prevId = flatLevels[idx - 1].id;
    if (!levelProgress[prevId]?.mastered) return LS.LOCKED;
  }
  if (prog.mastered) return LS.MASTERED;
  if (prog.accuracyUnlocked) return LS.SPEED;
  return LS.ACCURACY;
}

function getActiveLevelId(levelProgress) {
  for (const lv of flatLevels) {
    const s = getLevelState(lv.id, levelProgress);
    if (s === LS.ACCURACY || s === LS.SPEED) return lv.id;
  }
  return flatLevels[flatLevels.length - 1].id;
}

function getMasteredIds(levelProgress) {
  return flatLevels.filter(l => levelProgress[l.id]?.mastered).map(l => l.id);
}

// ── Badge system ──────────────────────────────────────────────────────────────
const BADGE_DEFS = [
  { id: "first_accuracy", label: "First Step",     desc: "Passed your first accuracy check",     color: "#22c55e" },
  { id: "first_speed",    label: "Speed Starter",  desc: "Earned your first speed pass",         color: "#3b82f6" },
  { id: "first_master",   label: "Level Master",   desc: "Mastered your first level",            color: "#f59e0b" },
  { id: "five_master",    label: "Rising Star",    desc: "Mastered 5 levels",                    color: "#a855f7" },
  { id: "ten_master",     label: "Ten Strong",     desc: "Mastered 10 levels",                   color: "#ec4899" },
  { id: "halfway",        label: "Halfway Hero",   desc: `Mastered half the levels`,             color: "#06b6d4" },
  { id: "all_master",     label: "Maths Champion", desc: "Mastered every single level!",         color: "#ffd700" },
  { id: "perfect",        label: "Perfect Sheet",  desc: "100% accuracy on a speed phase",       color: "#22c55e" },
  { id: "personal_best",  label: "Personal Best",  desc: "Beat your best time on a level",       color: "#3b82f6" },
  { id: "q100",           label: "Centurion",      desc: "Answered 100 questions correctly",     color: "#f59e0b" },
  { id: "q500",           label: "500 Club",       desc: "Answered 500 questions correctly",     color: "#a855f7" },
  { id: "q1000",          label: "Thousand!",      desc: "Answered 1000 questions correctly",    color: "#ef4444" },
  { id: "streak3",        label: "On a Roll",      desc: "3-day practice streak",                color: "#f97316" },
  { id: "streak7",        label: "Week Warrior",   desc: "7-day practice streak",                color: "#ef4444" },
  { id: "streak14",       label: "Fortnight+",     desc: "14-day practice streak",               color: "#ffd700" },
];

function computeNewBadges(profile, sessionData) {
  const { accuracy, isSpeedPhase, newSpeedPasses, newMasteredCount, newTotalQ, newStreak, isBestTime } = sessionData;
  const already = new Set(profile.badges || []);
  const earned = [];
  const add = (id) => { if (!already.has(id)) earned.push(id); };

  if (!isSpeedPhase && accuracy >= ACCURACY_THRESHOLD) add("first_accuracy");
  if (isSpeedPhase && accuracy >= ACCURACY_THRESHOLD && newSpeedPasses >= 1) add("first_speed");
  if (newMasteredCount >= 1) add("first_master");
  if (newMasteredCount >= 5) add("five_master");
  if (newMasteredCount >= 10) add("ten_master");
  if (newMasteredCount >= Math.floor(flatLevels.length / 2)) add("halfway");
  if (newMasteredCount >= flatLevels.length) add("all_master");
  if (isSpeedPhase && accuracy === 100) add("perfect");
  if (isBestTime) add("personal_best");
  if (newTotalQ >= 100) add("q100");
  if (newTotalQ >= 500) add("q500");
  if (newTotalQ >= 1000) add("q1000");
  if (newStreak >= 3) add("streak3");
  if (newStreak >= 7) add("streak7");
  if (newStreak >= 14) add("streak14");

  return earned;
}

// ── Encouragement messages (calibrated to performance) ────────────────────────
function getEncouragement(accuracy, time, masteryTime, isSpeedPhase, speedPasses) {
  if (!isSpeedPhase) {
    if (accuracy >= ACCURACY_THRESHOLD) return { emoji: "🎯", headline: "Accuracy unlocked!", body: "You're ready for the speed challenge. Now let's build those fast recall skills!", type: "success" };
    if (accuracy >= 80) return { emoji: "💪", headline: "Nearly there!", body: `You got ${accuracy}% — just need ${ACCURACY_THRESHOLD}% to move to speed practice. A few more careful tries!`, type: "info" };
    if (accuracy >= 60) return { emoji: "📚", headline: "Good effort!", body: "Take your time with each question. Try saying the answer in your head before typing. You've got this!", type: "info" };
    return { emoji: "❤️", headline: "Keep going!", body: "Everyone starts somewhere — even the best mathematicians had to practise. Try again and it will feel easier!", type: "encourage" };
  }
  const onTime = time <= masteryTime;
  if (accuracy >= ACCURACY_THRESHOLD && onTime) {
    const remaining = SPEED_PASSES_NEEDED - speedPasses;
    if (remaining <= 0) return { emoji: "🏆", headline: "LEVEL MASTERED!", body: "Incredible work — you've proven accuracy AND speed. Next level is now open!", type: "mastery" };
    if (remaining === 1) return { emoji: "⭐", headline: "One more to go!", body: `Just 1 more fast, accurate run to master this level. You're almost there!`, type: "success" };
    return { emoji: "⚡", headline: `Speed pass ${speedPasses} of ${SPEED_PASSES_NEEDED}!`, body: `Accuracy AND speed — great combination! Keep building that fluency.`, type: "success" };
  }
  if (accuracy >= ACCURACY_THRESHOLD && !onTime) {
    const over = time - masteryTime;
    return { emoji: "🕐", headline: "Accurate but needs speed!", body: `${over}s over the target. Your recall is solid — just push a little faster. Each practice gets quicker!`, type: "info" };
  }
  if (accuracy < ACCURACY_THRESHOLD && onTime) {
    return { emoji: "🎯", headline: "Fast but some mistakes!", body: `Speed is there — now focus on accuracy. ${ACCURACY_THRESHOLD}%+ needed. Slow down just a touch on the tricky ones.`, type: "info" };
  }
  return { emoji: "💡", headline: "Keep practising!", body: "Both accuracy and speed improve together with regular practice. Every session makes you stronger!", type: "encourage" };
}

// ── Storage ───────────────────────────────────────────────────────────────────
const EMPTY_PROFILE = (id, name) => ({ id, name, totalQuestions: 0, streak: 0, bestStreak: 0, lastCompletedDate: "", history: [], levelProgress: {}, badges: [], placementDone: false });

// ── App phases ────────────────────────────────────────────────────────────────
const PHASE = { WELCOME:"welcome", SIGNUP:"signup", PIN_ENTRY:"pin_entry", PLACEMENT:"placement", APP:"app" };

// ── Placement test ────────────────────────────────────────────────────────────
// Block-based adaptive: 3 questions per stage. Need 2/3 correct + speed to advance.
// Speed is measured silently — no countdown shown to child.
const PLACEMENT_STAGES = [
  { levelId:"add-1",        label:"Basic addition",           speedSecs:8,  questions:[{a:3,b:1,op:"+"},{a:7,b:2,op:"+"},{a:4,b:1,op:"+"}] },
  { levelId:"make-10",      label:"Adding to 10",             speedSecs:9,  questions:[{a:6,b:4,op:"+"},{a:7,b:3,op:"+"},{a:5,b:5,op:"+"}] },
  { levelId:"add-mix-20",   label:"Adding to 20",             speedSecs:11, questions:[{a:13,b:5,op:"+"},{a:9,b:7,op:"+"},{a:8,b:8,op:"+"}] },
  { levelId:"sub-mix-20",   label:"Subtraction to 20",        speedSecs:12, questions:[{a:15,b:7,op:"-"},{a:18,b:9,op:"-"},{a:14,b:8,op:"-"}] },
  { levelId:"add-carry",    label:"Adding with carrying",     speedSecs:16, questions:[{a:27,b:18,op:"+"},{a:36,b:27,op:"+"},{a:48,b:16,op:"+"}] },
  { levelId:"sub-borrow",   label:"Subtracting bigger numbers",speedSecs:16,questions:[{a:52,b:27,op:"-"},{a:71,b:38,op:"-"},{a:63,b:26,op:"-"}] },
  { levelId:"times-2",      label:"Multiplication basics",    speedSecs:9,  questions:[{a:3,b:5,op:"×"},{a:4,b:2,op:"×"},{a:6,b:10,op:"×"}] },
  { levelId:"times-3-4",    label:"Times tables (3s & 4s)",   speedSecs:12, questions:[{a:3,b:7,op:"×"},{a:4,b:8,op:"×"},{a:3,b:9,op:"×"}] },
  { levelId:"times-6-7",    label:"Times tables (6s & 7s)",   speedSecs:14, questions:[{a:6,b:7,op:"×"},{a:7,b:8,op:"×"},{a:6,b:9,op:"×"}] },
];

function ageToStartStage(age) {
  const n = parseInt(age, 10);
  if (n <= 6) return 0;
  if (n <= 7) return 1;
  if (n <= 8) return 2;
  if (n <= 9) return 3;
  if (n <= 10) return 4;
  return 6;
}

function buildPlacementProgress(placedLevelId) {
  const placedIdx = flatLevels.findIndex(l => l.id === placedLevelId);
  const progress = {};
  for (let i = 0; i < placedIdx; i++) {
    progress[flatLevels[i].id] = { mastered: true, accuracyUnlocked: true, speedPasses: 3, attempts: 0, bestAccuracy: 100 };
  }
  return progress;
}

// ── WelcomeScreen ─────────────────────────────────────────────────────────────
function WelcomeScreen({ onNew, onReturn }) {
  const PX = "'Press Start 2P', monospace";
  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"#fff", border:"4px solid #111", boxShadow:"8px 8px 0 #111", padding:36, maxWidth:440, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:8 }}>⭐</div>
        <h1 style={{ fontFamily:PX, fontSize:14, color:"#4f46e5", lineHeight:1.8, marginBottom:8 }}>Get Maths Mastery</h1>
        <p style={{ fontSize:14, color:"#6b7280", fontWeight:700, lineHeight:1.6, marginBottom:32 }}>
          Accuracy first, speed second.<br/>Level up like a champion!
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <button onClick={onNew} style={{ border:"4px solid #4f46e5", background:"#4f46e5", color:"#fff", fontFamily:PX, fontSize:10, padding:"16px", cursor:"pointer", boxShadow:"5px 5px 0 #312e81", lineHeight:1.8 }}>
            I'm new here
          </button>
          <button onClick={onReturn} style={{ border:"4px solid #111", background:"#fff", color:"#111", fontFamily:PX, fontSize:10, padding:"16px", cursor:"pointer", boxShadow:"5px 5px 0 #111", lineHeight:1.8 }}>
            I have a PIN
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SignupScreen ──────────────────────────────────────────────────────────────
function SignupScreen({ onComplete, onBack }) {
  const PX = "'Press Start 2P', monospace";
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");

  function nextStep() {
    if (step === 1) {
      if (!name.trim()) { setError("Please enter a name."); return; }
      if (!age || parseInt(age) < 4 || parseInt(age) > 16) { setError("Please enter an age between 4 and 16."); return; }
      setError(""); setStep(2);
    } else if (step === 2) {
      if (!/^\d{6}$/.test(pin)) { setError("PIN must be exactly 6 digits."); return; }
      setError(""); setStep(3);
    } else if (step === 3) {
      if (pin !== pinConfirm) { setError("PINs don't match — try again."); setPinConfirm(""); return; }
      onComplete({ name: name.trim(), age: parseInt(age), pin });
    }
  }

  const inputStyle = { border:"3px solid #4f46e5", padding:"12px 16px", fontSize:18, fontFamily:"'Nunito',sans-serif", fontWeight:700, width:"100%", boxSizing:"border-box", outline:"none" };
  const btnStyle = { border:"4px solid #4f46e5", background:"#4f46e5", color:"#fff", fontFamily:PX, fontSize:10, padding:"14px", cursor:"pointer", boxShadow:"5px 5px 0 #312e81", width:"100%", lineHeight:1.8 };

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"#fff", border:"4px solid #111", boxShadow:"8px 8px 0 #111", padding:32, maxWidth:420, width:"100%" }}>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {[1,2,3].map(s => <div key={s} style={{ flex:1, height:6, borderRadius:3, background: s<=step?"#4f46e5":"#e5e7eb", transition:"background 0.3s" }} />)}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#4f46e5", marginBottom:20 }}>Step 1: Who are you?</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:800, color:"#374151", display:"block", marginBottom:6 }}>Your name</label>
              <input autoFocus value={name} onChange={e => { setName(e.target.value); setError(""); }}
                onKeyDown={e => e.key==="Enter" && nextStep()}
                style={inputStyle} placeholder="e.g. Emma" maxLength={30} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:800, color:"#374151", display:"block", marginBottom:6 }}>Your age</label>
              <input type="number" value={age} onChange={e => { setAge(e.target.value); setError(""); }}
                onKeyDown={e => e.key==="Enter" && nextStep()}
                style={{ ...inputStyle, width:120 }} placeholder="e.g. 8" min={4} max={16} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#4f46e5", marginBottom:12 }}>Step 2: Choose a PIN</div>
            <p style={{ fontSize:13, color:"#6b7280", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
              Your 6-digit PIN saves your progress across all your devices. <strong>Write it down somewhere safe!</strong>
            </p>
            <input autoFocus type="number" inputMode="numeric" value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g,"").slice(0,6)); setError(""); }}
              onKeyDown={e => e.key==="Enter" && nextStep()}
              style={{ ...inputStyle, fontSize:28, letterSpacing:8, textAlign:"center" }} placeholder="——————" maxLength={6} />
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#4f46e5", marginBottom:12 }}>Step 3: Confirm PIN</div>
            <p style={{ fontSize:13, color:"#6b7280", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
              Your PIN is <strong style={{ fontFamily:"monospace", fontSize:20, letterSpacing:4 }}>{pin}</strong><br/>
              Type it again to confirm.
            </p>
            <input autoFocus type="number" inputMode="numeric" value={pinConfirm}
              onChange={e => { setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,6)); setError(""); }}
              onKeyDown={e => e.key==="Enter" && nextStep()}
              style={{ ...inputStyle, fontSize:28, letterSpacing:8, textAlign:"center" }} placeholder="——————" maxLength={6} />
          </>
        )}

        {error && <p style={{ color:"#ef4444", fontWeight:800, fontSize:13, marginTop:10 }}>{error}</p>}

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={() => step===1 ? onBack() : setStep(s=>s-1)}
            style={{ border:"3px solid #d1d5db", background:"#fff", color:"#6b7280", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>
            Back
          </button>
          <button onClick={nextStep} style={{ ...btnStyle, flex:1, padding:"12px" }}>
            {step === 3 ? "Create account" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PinEntryScreen ────────────────────────────────────────────────────────────
function PinEntryScreen({ onSubmit, onBack, loading, error }) {
  const PX = "'Press Start 2P', monospace";
  const [pin, setPin] = useState("");
  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"#fff", border:"4px solid #111", boxShadow:"8px 8px 0 #111", padding:32, maxWidth:400, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔑</div>
        <div style={{ fontFamily:PX, fontSize:11, color:"#4f46e5", marginBottom:16 }}>Enter your PIN</div>
        <p style={{ fontSize:13, color:"#6b7280", fontWeight:700, marginBottom:20 }}>Type your 6-digit PIN to load your progress on this device.</p>
        <input autoFocus type="number" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,6))}
          onKeyDown={e => e.key==="Enter" && pin.length===6 && onSubmit(pin)}
          style={{ border:"3px solid #4f46e5", padding:"12px", fontSize:28, fontFamily:"monospace", letterSpacing:8, textAlign:"center", width:"100%", boxSizing:"border-box", marginBottom:16 }}
          placeholder="——————" maxLength={6} />
        {error && <p style={{ color:"#ef4444", fontWeight:800, fontSize:13, marginBottom:12 }}>{error}</p>}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onBack} style={{ border:"3px solid #d1d5db", background:"#fff", color:"#6b7280", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>Back</button>
          <button onClick={() => onSubmit(pin)} disabled={pin.length!==6||loading}
            style={{ flex:1, border:"4px solid #4f46e5", background: pin.length===6&&!loading?"#4f46e5":"#e5e7eb", color: pin.length===6&&!loading?"#fff":"#9ca3af", fontFamily:PX, fontSize:10, padding:"12px", cursor: pin.length===6&&!loading?"pointer":"not-allowed", boxShadow: pin.length===6&&!loading?"5px 5px 0 #312e81":"none" }}>
            {loading ? "Loading…" : "Load Progress"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PlacementTest (block-based, speed-measured) ───────────────────────────────
// 3 questions per stage. Need 2/3 correct + avg speed ≤ threshold to advance.
// Speed measured silently — no countdown shown to child.
function PlacementTest({ profileName, startStage, onComplete, onParentOverride, parentPin }) {
  const PX = "'Press Start 2P', monospace";
  const clampedStart = Math.min(startStage, PLACEMENT_STAGES.length - 1);
  const [stageIdx, setStageIdx] = useState(clampedStart);
  const [blockQ, setBlockQ] = useState(0);
  const [blockResults, setBlockResults] = useState([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [done, setDone] = useState(false);
  const [placedStageIdx, setPlacedStageIdx] = useState(clampedStart);
  const [lastPassedStage, setLastPassedStage] = useState(null);  // highest stage passed
  const [showParentOverride, setShowParentOverride] = useState(false);
  const [parentEntry, setParentEntry] = useState("");
  const [parentErr, setParentErr] = useState("");
  const qStartRef = useRef(performance.now());
  const inputRef = useRef(null);

  const stage = PLACEMENT_STAGES[stageIdx];
  const q = stage.questions[blockQ % stage.questions.length];
  const correctAnswer = computeAnswer(q.a, q.b, q.op);

  useEffect(() => {
    if (!done && !feedback && !showParentOverride) {
      qStartRef.current = performance.now();
      inputRef.current?.focus();
    }
  }, [blockQ, stageIdx, done, feedback, showParentOverride]);

  function submit() {
    if (feedback || !answer) return;
    const secs = (performance.now() - qStartRef.current) / 1000;
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(correctAnswer);
    setFeedback(isCorrect ? "correct" : "wrong");
    const newResults = [...blockResults, { correct: isCorrect, secs }];

    setTimeout(() => {
      const nextQ = blockQ + 1;
      if (nextQ < 3) {
        // Still in this block
        setBlockQ(nextQ);
        setBlockResults(newResults);
        setAnswer("");
        setFeedback(null);
        return;
      }

      // Block complete — evaluate pass/fail
      const correctCount = newResults.filter(r => r.correct).length;
      const avgSecs = newResults.reduce((s, r) => s + r.secs, 0) / newResults.length;
      const passed = correctCount >= 2 && avgSecs <= stage.speedSecs;
      const slowPass = correctCount >= 2 && avgSecs > stage.speedSecs; // right but too slow

      if (passed) {
        // Passed this stage
        const newLastPassed = stageIdx;
        setLastPassedStage(newLastPassed);
        if (stageIdx < PLACEMENT_STAGES.length - 1) {
          // Try next stage up
          setStageIdx(s => s + 1);
          setBlockQ(0);
          setBlockResults([]);
          setAnswer("");
          setFeedback(null);
        } else {
          // Passed the highest stage — place at top
          setPlacedStageIdx(stageIdx);
          setDone(true);
        }
      } else if (slowPass) {
        // Correct but slow — place one below current
        setPlacedStageIdx(stageIdx > 0 ? stageIdx - 1 : 0);
        setDone(true);
      } else {
        // Failed — if we've already passed a lower stage, place there
        if (lastPassedStage !== null) {
          setPlacedStageIdx(lastPassedStage);
          setDone(true);
        } else if (stageIdx > 0) {
          // Haven't passed anything yet — try one stage lower
          setStageIdx(s => s - 1);
          setBlockQ(0);
          setBlockResults([]);
          setAnswer("");
          setFeedback(null);
        } else {
          // Failed at stage 0 — place at the beginning
          setPlacedStageIdx(0);
          setDone(true);
        }
      }
    }, 800);
  }

  if (done) {
    const placedLevel = PLACEMENT_STAGES[placedStageIdx];
    const placedFlat = flatLevels.find(l => l.id === placedLevel.levelId);
    const placedFlatIdx = flatLevels.findIndex(l => l.id === placedLevel.levelId);
    return (
      <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ background:"#fff", border:"4px solid #4f46e5", padding:32, maxWidth:460, width:"100%", boxShadow:"8px 8px 0 #4f46e5", textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:12 }}>🎯</div>
          <div style={{ fontFamily:PX, fontSize:12, color:"#4f46e5", marginBottom:16 }}>Placement Complete!</div>
          <p style={{ fontSize:15, fontWeight:800, color:"#111", marginBottom:8 }}>Well done, {profileName}!</p>
          <p style={{ fontSize:13, color:"#6b7280", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
            Based on your speed and accuracy, we're starting you here:
          </p>
          <div style={{ background:"#f0f4ff", border:"3px solid #4f46e5", padding:"16px 20px", marginBottom:8 }}>
            <div style={{ fontFamily:PX, fontSize:10, color:"#4f46e5", marginBottom:6 }}>{placedFlat?.sectionName}</div>
            <div style={{ fontWeight:900, fontSize:20, color:"#111" }}>{placedFlat?.title}</div>
          </div>
          {placedFlatIdx > 0 && (
            <p style={{ fontSize:12, color:"#6b7280", marginBottom:20 }}>
              {placedFlatIdx} easier level{placedFlatIdx!==1?"s":""} before this have been unlocked for extra practice.
            </p>
          )}
          <button onClick={() => onComplete(buildPlacementProgress(placedLevel.levelId))}
            style={{ border:"4px solid #4f46e5", background:"#4f46e5", color:"#fff", fontFamily:PX, fontSize:10, padding:"16px", cursor:"pointer", boxShadow:"5px 5px 0 #312e81", width:"100%", lineHeight:1.8 }}>
            Let's Go! ⭐
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"#fff", border:"4px solid #4f46e5", padding:32, maxWidth:460, width:"100%", boxShadow:"8px 8px 0 #4f46e5" }}>
        <div style={{ fontFamily:PX, fontSize:10, color:"#4f46e5", marginBottom:4 }}>Placement Test</div>
        <p style={{ fontSize:12, color:"#6b7280", fontWeight:700, marginBottom:16 }}>Finding your perfect starting level, {profileName}!</p>

        {/* Stage progress */}
        <div style={{ display:"flex", gap:4, marginBottom:8 }}>
          {PLACEMENT_STAGES.map((_, i) => (
            <div key={i} style={{ flex:1, height:8, borderRadius:4, background: i < stageIdx?"#4f46e5":i===stageIdx?"#a5b4fc":"#e5e7eb", transition:"background 0.3s" }} />
          ))}
        </div>
        {/* Block progress dots */}
        <div style={{ display:"flex", gap:8, marginBottom:20, justifyContent:"center" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width:14, height:14, borderRadius:"50%", border:"2px solid #4f46e5",
              background: i < blockQ ? (blockResults[i]?.correct ? "#22c55e" : "#ef4444") : i===blockQ ? "#4f46e5" : "#fff", transition:"background 0.3s" }} />
          ))}
        </div>
        <div style={{ fontSize:12, color:"#9ca3af", fontWeight:700, marginBottom:20, textAlign:"center" }}>
          {stage.label} — Question {blockQ + 1} of 3
        </div>

        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontFamily:PX, fontSize:32, color:"#111", marginBottom:20, letterSpacing:2, lineHeight:1.6 }}>
            {q.a} {q.op} {q.b} = ?
          </div>
          <input ref={inputRef} type="number" inputMode="numeric" value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key==="Enter" && answer!=="" && !feedback && submit()}
            style={{ border:`3px solid ${feedback==="correct"?"#16a34a":feedback==="wrong"?"#ef4444":"#4f46e5"}`, padding:"12px 16px", fontSize:28, fontFamily:"monospace", width:140, textAlign:"center", background:feedback==="correct"?"#dcfce7":feedback==="wrong"?"#fee2e2":"#fff", transition:"all 0.2s", outline:"none" }}
            disabled={!!feedback} />
          {feedback && (
            <div style={{ marginTop:12, fontWeight:900, fontSize:15, color:feedback==="correct"?"#16a34a":"#ef4444" }}>
              {feedback==="correct" ? "✓ Correct!" : `✗ Answer: ${correctAnswer}`}
            </div>
          )}
        </div>

        <button onClick={submit} disabled={answer===""||!!feedback}
          style={{ width:"100%", border:"4px solid #4f46e5", background:answer===""||feedback?"#e5e7eb":"#4f46e5", color:answer===""||feedback?"#9ca3af":"#fff", fontFamily:PX, fontSize:10, padding:"14px", cursor:answer===""||feedback?"not-allowed":"pointer", boxShadow:answer===""||feedback?"none":"5px 5px 0 #312e81", lineHeight:1.8 }}>
          Submit
        </button>

        {/* Parent override */}
        {!showParentOverride && (
          <p onClick={() => setShowParentOverride(true)} style={{ fontSize:11, color:"#d1d5db", textAlign:"center", marginTop:16, cursor:"pointer" }}>Parent override</p>
        )}
        {showParentOverride && (
          <div style={{ marginTop:16, padding:"12px", background:"#f9fafb", border:"2px solid #e5e7eb" }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#6b7280", marginBottom:8 }}>Enter parent PIN to skip:</p>
            <div style={{ display:"flex", gap:8 }}>
              <input type="password" inputMode="numeric" maxLength={4} value={parentEntry}
                onChange={e => { setParentEntry(e.target.value.replace(/\D/g,"").slice(0,4)); setParentErr(""); }}
                style={{ flex:1, border:"2px solid #4f46e5", padding:"8px", fontSize:16, textAlign:"center" }} placeholder="PIN" />
              <button onClick={() => { if (parentEntry===parentPin) onParentOverride(); else setParentErr("Wrong PIN"); }}
                style={{ border:"2px solid #4f46e5", background:"#4f46e5", color:"#fff", fontFamily:PX, fontSize:8, padding:"8px 12px", cursor:"pointer" }}>
                Skip
              </button>
            </div>
            {parentErr && <p style={{ color:"#ef4444", fontSize:12, fontWeight:700, marginTop:6 }}>{parentErr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function safeRead() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function safeWrite(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }
function loadState() {
  const s = safeRead();
  const syncPin = s?.syncPin || "";
  const rawProfiles = s?.profiles || {};
  // Migrate existing profiles — mark placementDone if they already have progress
  const profiles = {};
  for (const [id, p] of Object.entries(rawProfiles)) {
    profiles[id] = {
      ...EMPTY_PROFILE(id, p.name || id),
      ...p,
      placementDone: p.placementDone || (p.history?.length > 0) || (Object.keys(p.levelProgress || {}).length > 0),
    };
  }
  const activeProfileId = s?.activeProfileId || "";
  const appSettings = { ...DEFAULT_APP_SETTINGS, ...(s?.appSettings || {}) };
  // Determine initial phase
  let initialPhase = PHASE.WELCOME;
  if (syncPin && profiles[activeProfileId]?.placementDone) initialPhase = PHASE.APP;
  else if (syncPin && profiles[activeProfileId]) initialPhase = PHASE.PLACEMENT;
  else if (!syncPin && activeProfileId && profiles[activeProfileId]?.placementDone) initialPhase = PHASE.APP;
  return { profiles, activeProfileId, appSettings, syncPin, initialPhase };
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function formatTime(s) { if (!s && s !== 0) return "—"; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function formatMs(ms) { if (!Number.isFinite(ms) || ms <= 0) return "—"; return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`; }
function datesConsecutive(a, b) {
  if (!a || !b) return false;
  const d1 = new Date(a); const d2 = new Date(b);
  d1.setHours(0,0,0,0); d2.setHours(0,0,0,0);
  return (d2 - d1) / 86400000 === 1;
}

// ── Components ────────────────────────────────────────────────────────────────
function StarSVG({ size = 24, color = "#f59e0b" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:"block" }}><polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9 9 9" fill={color} /></svg>;
}

function PhaseIndicator({ passes, needed = SPEED_PASSES_NEEDED, size = 18 }) {
  return (
    <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
      {Array.from({ length: needed }, (_, i) => (
        <span key={i} style={{ width:size, height:size, borderRadius:3, border:"2px solid #111", background: i < passes ? "#ffd700" : "#e5e7eb", display:"inline-block" }} />
      ))}
    </span>
  );
}

function CelebrationOverlay({ show, onDismiss, encouragement, newBadges }) {
  if (!show) return null;
  const colors = ["#f59e0b","#ef4444","#3b82f6","#22c55e","#a855f7","#ec4899","#06b6d4"];
  const pieces = Array.from({ length: 28 }, (_, i) => ({ left:`${3+(i*3.4)%93}%`, color:colors[i%colors.length], delay:`${(i*0.09).toFixed(2)}s`, size:8+(i%5)*4 }));
  return (
    <div onClick={onDismiss} style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",cursor:"pointer" }}>
      {pieces.map((p,i) => <div key={i} style={{ position:"absolute",top:"-60px",left:p.left,width:p.size,height:p.size,background:p.color,borderRadius:i%2===0?"50%":2,animation:`confetti-fall 2.6s ease-in ${p.delay} both` }} />)}
      <div style={{ background:"#fff",border:"4px solid #111",boxShadow:"8px 8px 0 #111",padding:"36px 44px",textAlign:"center",maxWidth:420,animation:"celebrate-pulse 0.8s ease-in-out infinite" }}>
        <div style={{ fontSize:52, marginBottom:8 }}>{encouragement?.emoji || "🌟"}</div>
        <div style={{ fontSize:28,fontWeight:900,color:"#111",fontFamily:"'Nunito',sans-serif",lineHeight:1.2 }}>{encouragement?.headline}</div>
        <div style={{ fontSize:15,color:"#374151",fontWeight:700,marginTop:10,lineHeight:1.5 }}>{encouragement?.body}</div>
        {newBadges?.length > 0 && (
          <div style={{ marginTop:16,padding:"12px 16px",background:"#fef9c3",border:"2px solid #fbbf24" }}>
            <div style={{ fontSize:12,fontWeight:800,color:"#92400e",marginBottom:6 }}>BADGE EARNED!</div>
            {newBadges.map(id => { const b = BADGE_DEFS.find(d => d.id === id); return b ? <div key={id} style={{ fontWeight:900,fontSize:15,color:b.color }}>{b.label}</div> : null; })}
          </div>
        )}
        <div style={{ marginTop:16,fontSize:12,color:"#9ca3af",fontWeight:700 }}>Tap anywhere to continue</div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const loaded = loadState();
  const [appPhase, setAppPhase] = useState(loaded.initialPhase);
  const [profiles, setProfiles] = useState(loaded.profiles);
  const [activeProfileId, setActiveProfileId] = useState(loaded.activeProfileId);
  const [appSettings, setAppSettings] = useState(loaded.appSettings);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [practiceId, setPracticeId] = useState(null); // null = active level
  // PIN entry screen state
  const [pinLoading, setPinLoading] = useState(false);
  const [pinLoadError, setPinLoadError] = useState("");

  // Worksheet state
  const [answers, setAnswers] = useState({});
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [questionTimings, setQuestionTimings] = useState({});
  const inputRefs = useRef([]);
  const questionStartTimesRef = useRef({});

  // Settings
  const [pinEntry, setPinEntry] = useState("");
  const [newPin, setNewPin] = useState("");
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");

  // Placement test (no local state needed — handled by appPhase)

  // Cloud sync
  const [syncPin, setSyncPin] = useState(loaded.syncPin || "");
  const [syncStatus, setSyncStatus] = useState(""); // "", "syncing", "saved", "error"
  const syncTimeoutRef = useRef(null);

  // ── Derived state ───────────────────────────────────────────────────────────
  const profile = profiles[activeProfileId] || EMPTY_PROFILE(activeProfileId || "user", "Player");
  const { totalQuestions, streak, bestStreak, lastCompletedDate, history, levelProgress = {}, badges = [] } = profile;

  const activeLevelId = useMemo(() => getActiveLevelId(levelProgress), [levelProgress]);
  const currentLevelId = practiceId || activeLevelId;
  const currentLevel = flatLevels.find(l => l.id === currentLevelId) || flatLevels[0];
  const levelState = getLevelState(currentLevelId, levelProgress);
  const isSpeedPhase = levelState === LS.SPEED;
  const isAccuracyPhase = levelState === LS.ACCURACY;
  const currentProg = levelProgress[currentLevelId] || {};
  const masteredIds = useMemo(() => getMasteredIds(levelProgress), [levelProgress]);
  const masteredCount = masteredIds.length;
  const overallPct = Math.round((masteredCount / flatLevels.length) * 100);
  const todayDate = new Date().toLocaleDateString();

  const problems = useMemo(() => buildProblems(currentLevelId, masteredIds, isSpeedPhase), [currentLevelId, masteredIds, isSpeedPhase]);

  useEffect(() => { safeWrite({ profiles, activeProfileId, appSettings, syncPin }); }, [profiles, activeProfileId, appSettings, syncPin]);


  // Cloud sync — push to Firestore whenever profiles change (debounced 2s)
  const pushToCloud = useCallback((pin, data) => {
    if (!pin) return;
    setSyncStatus("syncing");
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, "profiles", pin), data);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus(""), 3000);
      } catch {
        setSyncStatus("error");
      }
    }, 2000);
  }, []);

  useEffect(() => {
    if (!syncPin) return;
    pushToCloud(syncPin, { profiles, activeProfileId, appSettings });
  }, [profiles, activeProfileId, appSettings, syncPin, pushToCloud]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTime(v => v + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const score = useMemo(() => {
    let correct = 0, attempted = 0;
    problems.forEach((p, i) => {
      const v = answers[i];
      if (!v && v !== 0) return;
      attempted++;
      if (normalizeAnswer(v) === normalizeAnswer(p.answer)) correct++;
    });
    return { correct, attempted, total: QUESTIONS_PER_SHEET, accuracy: Math.round((correct / QUESTIONS_PER_SHEET) * 100) };
  }, [answers, problems]);

  const hasAny = useMemo(() => Object.values(answers).some(v => String(v || "").trim() !== ""), [answers]);
  const allCorrect = useMemo(() => problems.every((p, i) => normalizeAnswer(answers[i] || "") === normalizeAnswer(p.answer)), [answers, problems]);

  useEffect(() => {
    if (done) return;
    if (hasAny && !allCorrect && !running) setRunning(true);
    if (allCorrect && hasAny && running) setRunning(false);
  }, [hasAny, allCorrect, running, done]);

  function updateProfile(patch) {
    setProfiles(prev => ({ ...prev, [activeProfileId]: { ...prev[activeProfileId], ...patch } }));
  }

  function completePlacement(levelProgress) {
    updateProfile({ levelProgress, placementDone: true });
    setAppPhase(PHASE.APP);
    startSession();
  }

  function skipPlacement() {
    updateProfile({ placementDone: true });
    setAppPhase(PHASE.APP);
  }

  function handleSignup({ name, age, pin }) {
    const id = pin;
    const newProfile = { ...EMPTY_PROFILE(id, name), age };
    setProfiles(prev => ({ ...prev, [id]: newProfile }));
    setActiveProfileId(id);
    setSyncPin(pin);
    setAppPhase(PHASE.PLACEMENT);
  }

  async function handlePinEntry(pin) {
    setPinLoading(true);
    setPinLoadError("");
    try {
      const snap = await getDoc(doc(db, "profiles", pin));
      if (snap.exists()) {
        const data = snap.data();
        setProfiles(data.profiles || {});
        setActiveProfileId(data.activeProfileId || pin);
        if (data.appSettings) setAppSettings(data.appSettings);
        setSyncPin(pin);
        const profile = (data.profiles || {})[data.activeProfileId || pin];
        setAppPhase(profile?.placementDone ? PHASE.APP : PHASE.PLACEMENT);
      } else {
        // No cloud data — create fresh profile with this PIN
        const id = pin;
        const newProfile = EMPTY_PROFILE(id, "My Account");
        setProfiles(prev => ({ ...prev, [id]: newProfile }));
        setActiveProfileId(id);
        setSyncPin(pin);
        setAppPhase(PHASE.PLACEMENT);
      }
    } catch {
      setPinLoadError("Could not connect. Check your internet and try again.");
    }
    setPinLoading(false);
  }

  function markQuestionStart(i) { if (!questionStartTimesRef.current[i]) questionStartTimesRef.current[i] = performance.now(); }

  function captureQuestionTiming(i, val) {
    const p = problems[i];
    if (!p || questionTimings[i]) return;
    if (normalizeAnswer(val) !== normalizeAnswer(p.answer)) return;
    setQuestionTimings(prev => ({ ...prev, [i]: performance.now() - (questionStartTimesRef.current[i] || performance.now()) }));
  }

  function focusQuestion(i) {
    markQuestionStart(i);
    const el = inputRefs.current[i];
    if (el) { el.focus(); el.select?.(); }
  }

  function startSession() {
    setAnswers({});
    setQuestionTimings({});
    questionStartTimesRef.current = {};
    setTime(0);
    setDone(false);
    setRunning(false);
    setShowCelebration(false);
    setLastResult(null);
    setTimeout(() => focusQuestion(0), 0);
  }

  function finishSession() {
    setRunning(false);
    setDone(true);

    const accuracy = score.accuracy;
    const passed = accuracy >= ACCURACY_THRESHOLD;
    const onTime = time <= currentLevel.masteryTime;

    // Update level progress
    const prog = { ...( levelProgress[currentLevelId] || {}) };
    prog.attempts = (prog.attempts || 0) + 1;
    prog.bestAccuracy = Math.max(prog.bestAccuracy || 0, accuracy);

    const prevBest = prog.bestTime;
    const isBestTime = isSpeedPhase && passed && onTime && (prevBest == null || time < prevBest);
    if (isBestTime) prog.bestTime = time;

    let newSpeedPasses = prog.speedPasses || 0;
    let justMastered = false;

    if (!isSpeedPhase) {
      // Accuracy phase
      if (passed) { prog.accuracyUnlocked = true; }
    } else {
      // Speed phase — need 95%+ AND on time
      if (passed && onTime) {
        newSpeedPasses = (prog.speedPasses || 0) + 1;
        prog.speedPasses = newSpeedPasses;
        if (newSpeedPasses >= SPEED_PASSES_NEEDED) { prog.mastered = true; justMastered = true; }
      }
    }

    const newLevelProgress = { ...levelProgress, [currentLevelId]: prog };

    // Streak
    const newStreak = lastCompletedDate === todayDate ? streak : datesConsecutive(lastCompletedDate, todayDate) ? streak + 1 : 1;
    const newTotalQ = totalQuestions + score.correct;
    const newMasteredCount = getMasteredIds(newLevelProgress).length;

    // Badges
    const newBadges = computeNewBadges({ badges }, { accuracy, isSpeedPhase, newSpeedPasses, newMasteredCount, newTotalQ, newStreak, isBestTime, levelProgress: newLevelProgress });

    // Timings
    const timings = Object.entries(questionTimings).map(([idx, ms]) => {
      const p = problems[Number(idx)];
      return { ms, label: `${p?.a} ${p?.op} ${p?.b}` };
    }).sort((a, b) => b.ms - a.ms);
    const avgMs = timings.length ? Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length) : 0;

    updateProfile({
      totalQuestions: newTotalQ,
      streak: newStreak,
      bestStreak: Math.max(bestStreak, newStreak),
      lastCompletedDate: todayDate,
      levelProgress: newLevelProgress,
      badges: [...badges, ...newBadges],
      history: [{
        id: `${Date.now()}`,
        date: todayDate,
        levelTitle: currentLevel.title,
        sectionName: currentLevel.sectionName,
        phase: isSpeedPhase ? "Speed" : "Accuracy",
        timeLabel: formatTime(time),
        seconds: time,
        correct: score.correct,
        total: QUESTIONS_PER_SHEET,
        accuracy,
        avgMs,
        passed,
        onTime,
        slowest: timings.slice(0, 3),
      }, ...history].slice(0, 60),
    });

    const encouragement = getEncouragement(accuracy, time, currentLevel.masteryTime, isSpeedPhase, newSpeedPasses);
    const shouldCelebrate = (passed && !isSpeedPhase) || (passed && onTime);
    setLastResult({ accuracy, time, encouragement, newBadges, justMastered, speedPasses: newSpeedPasses });
    setShowCelebration(shouldCelebrate);
    if (!shouldCelebrate) setLastResult({ accuracy, time, encouragement, newBadges: [], justMastered, speedPasses: newSpeedPasses });
  }

  function practiceLevel(id) {
    setPracticeId(id);
    startSession();
    setActiveTab("dashboard");
  }

  function resetProfile(profileId) {
    if (!window.confirm(`Reset ${profiles[profileId]?.name}? This erases all progress.`)) return;
    setProfiles(prev => ({ ...prev, [profileId]: EMPTY_PROFILE(profileId, prev[profileId]?.name || profileId) }));
    if (activeProfileId === profileId) startSession();
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const PX = "'Press Start 2P', monospace";
  const BD = "4px solid #111";
  const SD = "5px 5px 0 #111";

  const S = {
    page: { minHeight:"100vh", background:"#f0f4ff", fontFamily:"'Nunito',sans-serif", color:"#111", padding:16, boxSizing:"border-box" },
    wrap: { maxWidth:1100, margin:"0 auto" },
    card: { background:"#fff", border:BD, boxShadow:SD, padding:20, marginBottom:16 },
    flat: { background:"#f9fafb", border:"2px solid #e5e7eb", padding:14, marginBottom:10 },
    h: (sz=16) => ({ fontFamily:PX, fontSize:sz, lineHeight:1.7, margin:0, color:"#111" }),
    sub: { fontSize:13, color:"#6b7280", fontWeight:700, lineHeight:1.5, margin:0 },
    tab: (a) => ({ border:BD, padding:"10px 16px", cursor:"pointer", fontFamily:PX, fontSize:9, lineHeight:1.8, background:a?"#4f46e5":"#fff", color:a?"#fff":"#111", boxShadow:a?"5px 5px 0 #2e1f8f":SD }),
    btn: (bg="#4f46e5", sh="#2e1f8f") => ({ border:BD, padding:"12px 20px", background:bg, color:bg==="#ffd700"||bg==="#22c55e"?"#111":"#fff", fontFamily:PX, fontSize:10, lineHeight:1.8, boxShadow:`5px 5px 0 ${sh}`, cursor:"pointer" }),
    qCard: (cor, wr, lv) => ({ background:cor||lv?"#f0fdf4":wr?"#fef2f2":"#fff", border:`4px solid ${cor||lv?"#16a34a":wr?"#dc2626":"#e5e7eb"}`, boxShadow:`3px 3px 0 ${cor||lv?"#16a34a":wr?"#dc2626":"#d1d5db"}`, padding:"10px 8px", minHeight:86, position:"relative" }),
    inp: (lv,cor,wr) => ({ width:62, height:44, border:`4px solid ${lv||cor?"#16a34a":wr?"#dc2626":"#4f46e5"}`, textAlign:"center", fontSize:19, fontWeight:900, marginLeft:5, background:lv||cor?"#dcfce7":wr?"#fee2e2":"#eef2ff", outline:"none", fontFamily:"'Nunito',sans-serif", color:"#111", boxShadow:`2px 2px 0 ${lv||cor?"#16a34a":wr?"#dc2626":"#4f46e5"}` }),
    settingInp: { height:44, border:BD, padding:"0 12px", fontSize:15, fontWeight:700, background:"#fff", outline:"none", boxSizing:"border-box", fontFamily:"'Nunito',sans-serif", boxShadow:"3px 3px 0 #111" },
  };

  // Timer color logic (only shown in speed phase)
  const timerColor = time === 0 ? "#6b7280" : time <= currentLevel.masteryTime ? "#16a34a" : time <= currentLevel.masteryTime * 1.25 ? "#f59e0b" : "#ef4444";

  const stateLabel = { [LS.LOCKED]:"Locked", [LS.ACCURACY]:"Accuracy Phase", [LS.SPEED]:"Speed Phase", [LS.MASTERED]:"Mastered" };
  const stateColor = { [LS.LOCKED]:"#9ca3af", [LS.ACCURACY]:"#3b82f6", [LS.SPEED]:"#f59e0b", [LS.MASTERED]:"#22c55e" };

  // ── Phase routing ────────────────────────────────────────────────────────────
  if (appPhase === PHASE.WELCOME) return <WelcomeScreen onNew={() => setAppPhase(PHASE.SIGNUP)} onReturn={() => setAppPhase(PHASE.PIN_ENTRY)} />;
  if (appPhase === PHASE.SIGNUP) return <SignupScreen onComplete={handleSignup} onBack={() => setAppPhase(PHASE.WELCOME)} />;
  if (appPhase === PHASE.PIN_ENTRY) return <PinEntryScreen onSubmit={handlePinEntry} onBack={() => setAppPhase(PHASE.WELCOME)} loading={pinLoading} error={pinLoadError} />;
  if (appPhase === PHASE.PLACEMENT) {
    const prof = profiles[activeProfileId] || {};
    const startStage = ageToStartStage(prof.age || 8);
    return <PlacementTest profileName={prof.name || "there"} startStage={startStage} onComplete={completePlacement} onParentOverride={skipPlacement} parentPin={appSettings.parentPin} />;
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── Header ── */}
        <div style={{ ...S.card, background:"#4f46e5", borderTop:"4px solid #ffd700", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
            <div>
              <h1 style={{ ...S.h(17), color:"#ffd700" }}>Get Maths Mastery</h1>
              <p style={{ color:"#c7d2fe", fontSize:13, fontWeight:700, marginTop:5 }}>
                Welcome back, {profile.name}! Accuracy first, then speed.
              </p>
            </div>
            <button onClick={() => { if (window.confirm("Switch user? You'll go back to the login screen.")) { setAppPhase(PHASE.WELCOME); } }} className="fun-btn"
              style={{ border:BD, padding:"9px 14px", cursor:"pointer", fontFamily:PX, fontSize:8, lineHeight:1.8, background:"rgba(255,255,255,0.15)", color:"#fff", boxShadow:"5px 5px 0 rgba(0,0,0,0.3)", alignSelf:"flex-start" }}>
              Switch User
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginTop:14 }}>
            {[
              { label:"Questions", value:totalQuestions.toLocaleString(), color:"#ffd700" },
              { label:"Levels Mastered", value:`${masteredCount}/${flatLevels.length}`, color:"#34d399" },
              { label:"Progress", value:`${overallPct}%`, color:"#60a5fa" },
              { label:"Streak", value:`${streak} day${streak!==1?"s":""}`, color:"#f472b6" },
              { label:"Badges", value:badges.length, color:"#fbbf24" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.1)", border:"2px solid rgba(255,255,255,0.15)", padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.6)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:900, color, marginTop:3 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sync status bar ── */}
        {syncPin && syncStatus && (
          <div style={{ background: syncStatus==="saved"?"#dcfce7":syncStatus==="error"?"#fee2e2":"#fef9c3", border:`2px solid ${syncStatus==="saved"?"#16a34a":syncStatus==="error"?"#ef4444":"#f59e0b"}`, padding:"8px 14px", marginBottom:10, fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
            <span>{syncStatus==="saved"?"✓ Progress saved to cloud":syncStatus==="error"?"✗ Sync error — check connection":"↑ Syncing…"}</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          {[["dashboard","Worksheet"],["journey","Journey Map"],["badges","Badges"],["history","History"],["settings","Settings"]].map(([id,label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className="fun-btn" style={S.tab(activeTab===id)}>{label}</button>
          ))}
        </div>

        {/* ═══════════════ DASHBOARD ═══════════════ */}
        {activeTab === "dashboard" && (
          <>
            <CelebrationOverlay show={showCelebration} onDismiss={() => { setShowCelebration(false); setActiveTab("dashboard"); }}
              encouragement={lastResult?.encouragement} newBadges={lastResult?.newBadges} />

            {/* Current level info card */}
            <div style={{ ...S.card, borderLeft:`8px solid ${stateColor[levelState]}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:currentLevel.sectionColor, fontWeight:900, fontFamily:PX, lineHeight:1.6, marginBottom:4 }}>{currentLevel.sectionName}</div>
                  <div style={S.h(14)}>{currentLevel.title}</div>
                  <div style={{ ...S.sub, marginTop:4 }}>{currentLevel.skill}</div>

                  {/* Phase status */}
                  <div style={{ marginTop:10, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                    <span style={{ display:"inline-block", padding:"4px 10px", background:stateColor[levelState]+"22", border:`2px solid ${stateColor[levelState]}`, fontFamily:PX, fontSize:8, lineHeight:1.8, color:stateColor[levelState] }}>
                      {stateLabel[levelState]}
                    </span>
                    {isSpeedPhase && (
                      <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:"#6b7280" }}>Mastery passes:</span>
                        <PhaseIndicator passes={currentProg.speedPasses || 0} />
                      </span>
                    )}
                    {levelState === LS.MASTERED && <span style={{ fontSize:13, fontWeight:800, color:"#16a34a" }}>✓ Mastered!</span>}
                  </div>
                </div>

                {/* Target info */}
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  {isSpeedPhase ? (
                    <>
                      <div style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>Target time</div>
                      <div style={{ fontSize:26, fontWeight:900, color:"#4f46e5", fontFamily:PX, lineHeight:1.3 }}>{formatTime(currentLevel.masteryTime)}</div>
                      {currentProg.bestTime != null && <div style={{ fontSize:12, color:"#16a34a", fontWeight:800, marginTop:2 }}>Your best: {formatTime(currentProg.bestTime)}</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>Phase 1</div>
                      <div style={{ fontSize:16, fontWeight:900, color:"#3b82f6", lineHeight:1.3 }}>Accuracy</div>
                      <div style={{ fontSize:12, color:"#6b7280", fontWeight:700 }}>Goal: {ACCURACY_THRESHOLD}%+</div>
                    </>
                  )}
                </div>
              </div>

              {/* Strategy tip — shown in accuracy phase to help build understanding */}
              {isAccuracyPhase && (
                <div style={{ marginTop:12, padding:"10px 14px", background:"#eff6ff", border:"2px solid #bfdbfe" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#1d4ed8" }}>
                    💡 <em>{currentLevel.sectionTip}</em>
                  </span>
                </div>
              )}

              {/* Mastery requirements explanation */}
              <div style={{ marginTop:10, padding:"10px 14px", background:"#f9fafb", border:"2px solid #e5e7eb", fontSize:12, fontWeight:700, color:"#374151" }}>
                {isAccuracyPhase && `Phase 1 — Accuracy: Get ${ACCURACY_THRESHOLD}%+ correct to unlock Phase 2 (Speed)`}
                {isSpeedPhase && `Phase 2 — Speed: ${ACCURACY_THRESHOLD}%+ accuracy AND under ${formatTime(currentLevel.masteryTime)} · Need ${SPEED_PASSES_NEEDED} passes to master`}
                {levelState === LS.MASTERED && "This level is mastered! Practising it here keeps your skills sharp."}
                {levelState === LS.LOCKED && "Complete the previous level to unlock this one."}
              </div>
            </div>

            {/* Worksheet */}
            <div style={S.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {/* Timer: shown live only in speed phase */}
                  {isSpeedPhase ? (
                    <div style={{ background:"#111", color:timerColor, padding:"8px 14px", border:BD, fontFamily:PX, fontSize:15, lineHeight:1.4, minWidth:84, textAlign:"center" }}>
                      {formatTime(time)}
                    </div>
                  ) : (
                    <div style={{ background:"#f9fafb", color:"#9ca3af", padding:"8px 14px", border:"2px solid #e5e7eb", fontFamily:PX, fontSize:10, lineHeight:1.6 }}>
                      Focus on accuracy
                    </div>
                  )}
                  {isSpeedPhase && time > 0 && (
                    <div style={{ fontSize:12, fontWeight:800, color:timerColor }}>
                      {time <= currentLevel.masteryTime ? `${currentLevel.masteryTime - time}s left` : `${time - currentLevel.masteryTime}s over`}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <button onClick={startSession} className="fun-btn" style={S.btn("#6b7280","#374151")}>Restart</button>
                  <button onClick={finishSession} className="fun-btn" style={S.btn("#16a34a","#14532d")}>Finish &amp; Check!</button>
                </div>
              </div>

              {/* Live accuracy bar */}
              {hasAny && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:700, marginBottom:3, color:"#6b7280" }}>
                    <span>{score.correct} correct of {score.total}</span>
                    <span style={{ color: score.accuracy >= ACCURACY_THRESHOLD ? "#16a34a" : score.accuracy >= 80 ? "#f59e0b" : "#ef4444" }}>{score.accuracy}%</span>
                  </div>
                  <div style={{ width:"100%", height:12, background:"#e5e7eb", border:"3px solid #111", overflow:"hidden" }}>
                    <div style={{ width:`${score.accuracy}%`, height:"100%", background: score.accuracy >= ACCURACY_THRESHOLD ? "#22c55e" : score.accuracy >= 80 ? "#f59e0b" : "#ef4444", transition:"width 0.25s" }} />
                  </div>
                </div>
              )}

              {/* Review notice */}
              {isSpeedPhase && masteredIds.length >= 1 && (
                <div style={{ marginBottom:10, fontSize:12, color:"#6b7280", fontWeight:700, padding:"6px 10px", background:"#f0f4ff", border:"2px solid #c7d2fe" }}>
                  ♻️ This worksheet includes {REVIEW_Q_COUNT} review questions from previous levels — interleaved to strengthen your memory.
                </div>
              )}

              {/* Question grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))", gap:9 }}>
                {problems.map((p, i) => {
                  const val = answers[i] || "";
                  const correct = done && normalizeAnswer(val) === normalizeAnswer(p.answer);
                  const wrong = done && val !== "" && !correct;
                  const live = !done && val !== "" && normalizeAnswer(val) === normalizeAnswer(p.answer);
                  return (
                    <div key={`${currentLevelId}-${i}`} className={correct||live?"correct-card":""} style={{ ...S.qCard(correct,wrong,live), outline: p.isReview ? "2px dashed #c7d2fe" : "none" }}>
                      {p.isReview && <div style={{ fontSize:7, color:"#818cf8", fontFamily:PX, lineHeight:1.6, marginBottom:2 }}>Review</div>}
                      <div style={{ fontSize:7, color:"#9ca3af", fontFamily:PX, marginBottom:3, lineHeight:1.6 }}>Q{i+1}</div>
                      <div style={{ fontSize:19, fontWeight:900, display:"flex", alignItems:"center", gap:4 }}>
                        <span>{p.a} {p.op} {p.b} =</span>
                        <input
                          ref={el => { inputRefs.current[i] = el; }}
                          value={val}
                          inputMode="decimal"
                          onFocus={() => markQuestionStart(i)}
                          onChange={e => {
                            const cleaned = e.target.value.replace(/[^0-9./-]/g, "");
                            setAnswers(prev => ({ ...prev, [i]: cleaned }));
                            captureQuestionTiming(i, cleaned);
                            if (normalizeAnswer(cleaned).length >= normalizeAnswer(p.answer).length && cleaned.length > 0 && i < problems.length - 1) {
                              setTimeout(() => focusQuestion(i + 1), 0);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter" && i < problems.length - 1) { e.preventDefault(); focusQuestion(i + 1); }
                            if (e.key === "Backspace" && !val && i > 0) focusQuestion(i - 1);
                          }}
                          style={S.inp(live, correct, wrong)}
                        />
                      </div>
                      {(live || correct) && (
                        <div style={{ position:"absolute", top:4, right:6, animation:"emoji-pop 0.4s cubic-bezier(.34,1.56,.64,1) both" }}>
                          <StarSVG size={18} color="#f59e0b" />
                        </div>
                      )}
                      {done && <div style={{ marginTop:4, fontSize:11, color:"#6b7280", fontWeight:700 }}>{p.answer}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Results panel */}
            {done && lastResult && (
              <div style={{ ...S.card, borderColor: lastResult.justMastered ? "#ffd700" : lastResult.encouragement?.type === "success" ? "#22c55e" : lastResult.encouragement?.type === "info" ? "#3b82f6" : "#ef4444", borderWidth:4 }}>
                <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{lastResult.encouragement?.emoji}</div>
                    <div style={S.h(12)}>{lastResult.encouragement?.headline}</div>
                    <div style={{ ...S.sub, marginTop:6, maxWidth:480, lineHeight:1.6 }}>{lastResult.encouragement?.body}</div>
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[
                      { label:"Correct", val:`${score.correct}/${score.total}`, color: score.accuracy >= ACCURACY_THRESHOLD ? "#16a34a" : "#f59e0b" },
                      { label:"Accuracy", val:`${lastResult.accuracy}%`, color: lastResult.accuracy >= ACCURACY_THRESHOLD ? "#16a34a" : "#f59e0b" },
                      ...(isSpeedPhase ? [{ label:"Time", val:lastResult.time != null ? formatTime(lastResult.time) : "—", color: lastResult.time <= currentLevel.masteryTime ? "#16a34a" : "#f59e0b" }] : []),
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ textAlign:"center", padding:"10px 14px", background:"#f9fafb", border:"2px solid #e5e7eb" }}>
                        <div style={{ fontSize:11, color:"#6b7280", fontWeight:700 }}>{label}</div>
                        <div style={{ fontSize:22, fontWeight:900, color, marginTop:2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speed phase pass tracker */}
                {isSpeedPhase && (
                  <div style={{ marginTop:12, padding:"10px 14px", background:"#fef9c3", border:"2px solid #fbbf24", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#92400e" }}>Mastery passes:</span>
                    <PhaseIndicator passes={lastResult.speedPasses} />
                    <span style={{ fontSize:12, fontWeight:700, color:"#92400e" }}>{lastResult.speedPasses}/{SPEED_PASSES_NEEDED}</span>
                  </div>
                )}

                {/* Slowest questions tip */}
                {Object.keys(questionTimings).length > 3 && (
                  <div style={{ marginTop:10, padding:"10px 12px", background:"#f9fafb", border:"2px solid #e5e7eb" }}>
                    <div style={{ fontSize:12, fontWeight:800, color:"#374151", marginBottom:6 }}>Slowest questions — focus on these:</div>
                    {Object.entries(questionTimings).sort((a,b) => b[1]-a[1]).slice(0,3).map(([idx,ms]) => {
                      const p = problems[Number(idx)];
                      return p ? <div key={idx} style={{ fontSize:13, color:"#6b7280", marginTop:3 }}>{p.a} {p.op} {p.b} = {p.answer} → <strong style={{ color:"#111" }}>{formatMs(ms)}</strong></div> : null;
                    })}
                  </div>
                )}

                <div style={{ marginTop:12 }}>
                  <button onClick={startSession} className="fun-btn" style={S.btn("#4f46e5","#2e1f8f")}>Try Again</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════ JOURNEY MAP ═══════════════ */}
        {activeTab === "journey" && (
          <div style={S.card}>
            <div style={{ ...S.h(12), marginBottom:6 }}>Journey Map</div>
            <p style={{ ...S.sub, marginBottom:16 }}>Each level has two phases: Accuracy first, then Speed. Master both to unlock the next level.</p>

            {/* Overall progress */}
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, marginBottom:5, color:"#6b7280" }}>
                <span>Overall mastery</span><span>{masteredCount} of {flatLevels.length} levels ({overallPct}%)</span>
              </div>
              <div style={{ width:"100%", height:18, background:"#e5e7eb", border:BD, overflow:"hidden" }}>
                <div style={{ width:`${overallPct}%`, height:"100%", background:"#4f46e5", transition:"width 0.4s" }} />
              </div>
            </div>

            {CURRICULUM.map(section => (
              <div key={section.id} style={{ ...S.flat, borderLeft:`6px solid ${section.color}`, marginBottom:14 }}>
                <div style={{ fontWeight:900, fontSize:16, color:"#111", marginBottom:3 }}>{section.name}</div>
                <div style={{ fontSize:12, color:"#6b7280", fontWeight:700, marginBottom:10, lineHeight:1.5 }}>💡 {section.tip}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:8 }}>
                  {section.levels.map(level => {
                    const state = getLevelState(level.id, levelProgress);
                    const prog = levelProgress[level.id] || {};
                    const isLocked = state === LS.LOCKED;
                    const isMastered = state === LS.MASTERED;
                    const sc = stateColor[state];
                    return (
                      <button key={level.id} onClick={() => !isLocked && practiceLevel(level.id)} className={isLocked ? "" : "fun-btn"}
                        style={{ textAlign:"left", border:`4px solid ${isLocked?"#e5e7eb":sc}`, padding:12, background:isMastered?"#f0fdf4":state===LS.SPEED?"#fffbeb":state===LS.ACCURACY?"#eff6ff":"#f9fafb", cursor:isLocked?"not-allowed":"pointer", boxShadow:isLocked?"none":`4px 4px 0 ${sc}`, opacity:isLocked?0.55:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                          <div style={{ fontWeight:900, fontSize:13, color:isLocked?"#9ca3af":"#111" }}>{level.title}</div>
                          <span style={{ fontFamily:PX, fontSize:7, color:sc, lineHeight:1.6, whiteSpace:"nowrap" }}>
                            {isMastered?"✓":state===LS.SPEED?"⚡":state===LS.ACCURACY?"🎯":"🔒"}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, marginTop:3 }}>{level.skill}</div>
                        <div style={{ marginTop:8, display:"flex", justifyContent:"space-between", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af" }}>Target: {formatTime(level.masteryTime)}</span>
                          {prog.bestTime != null && <span style={{ fontSize:11, fontWeight:800, color:"#16a34a" }}>Best: {formatTime(prog.bestTime)}</span>}
                        </div>
                        {state === LS.SPEED && (
                          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#92400e" }}>Passes:</span>
                            <PhaseIndicator passes={prog.speedPasses || 0} size={14} />
                          </div>
                        )}
                        {state === LS.ACCURACY && prog.bestAccuracy > 0 && (
                          <div style={{ marginTop:4, fontSize:11, fontWeight:700, color:"#3b82f6" }}>Best accuracy: {prog.bestAccuracy}%</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════ BADGES ═══════════════ */}
        {activeTab === "badges" && (
          <div style={S.card}>
            <div style={{ ...S.h(12), marginBottom:6 }}>Badges</div>
            <p style={{ ...S.sub, marginBottom:20 }}>Earn badges by practising consistently and mastering levels. Keep going!</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
              {BADGE_DEFS.map(b => {
                const earned = badges.includes(b.id);
                return (
                  <div key={b.id} style={{ border:`4px solid ${earned?b.color:"#e5e7eb"}`, padding:16, background:earned?`${b.color}11`:"#f9fafb", boxShadow:earned?`4px 4px 0 ${b.color}66`:"none", opacity:earned?1:0.45 }}>
                    <div style={{ fontWeight:900, fontSize:15, color:earned?b.color:"#9ca3af" }}>{b.label}</div>
                    <div style={{ fontSize:12, color:"#6b7280", fontWeight:700, marginTop:4, lineHeight:1.5 }}>{b.desc}</div>
                    {earned && <div style={{ marginTop:8, fontFamily:PX, fontSize:7, color:b.color, lineHeight:1.8 }}>EARNED</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════ HISTORY ═══════════════ */}
        {activeTab === "history" && (
          <div style={S.card}>
            <div style={{ ...S.h(12), marginBottom:16 }}>Session History</div>
            {history.length === 0 ? <p style={S.sub}>No sessions yet — finish a worksheet to see your history here.</p> : history.slice(0,30).map(s => (
              <div key={s.id} style={S.flat}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:900, fontSize:15 }}>{s.levelTitle}</div>
                    <div style={{ ...S.sub, marginTop:2 }}>{s.sectionName} · {s.phase} Phase · {s.date}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontWeight:900, fontSize:20, color:s.accuracy>=ACCURACY_THRESHOLD?"#16a34a":s.accuracy>=80?"#f59e0b":"#ef4444" }}>{s.accuracy}%</div>
                    <div style={S.sub}>{s.correct}/{s.total} · {s.timeLabel}</div>
                    {s.phase==="Speed" && <div style={{ fontSize:11, fontWeight:800, color:s.passed&&s.onTime?"#16a34a":s.passed?"#f59e0b":"#ef4444", marginTop:2 }}>
                      {s.passed && s.onTime ? "✓ Speed pass" : s.passed ? "Accurate, not fast enough" : "Needs more accuracy"}
                    </div>}
                  </div>
                </div>
                {s.slowest?.length > 0 && (
                  <div style={{ marginTop:8, padding:"8px 10px", background:"#fff", border:"2px solid #e5e7eb" }}>
                    <div style={{ fontSize:11, fontWeight:800, marginBottom:4 }}>Slowest questions:</div>
                    {s.slowest.map((q, i) => <div key={i} style={{ fontSize:12, color:"#6b7280", marginTop:i>0?3:0 }}>{q.label} → <strong style={{ color:"#111" }}>{formatMs(q.ms)}</strong></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════ SETTINGS ═══════════════ */}
        {activeTab === "settings" && (
          <div style={S.card}>
            <div style={{ ...S.h(12), marginBottom:16 }}>Settings</div>
            {!isSettingsUnlocked ? (
              <div style={{ maxWidth:380 }}>
                <p style={S.sub}>Enter your parent PIN to access settings.</p>
                <input type="password" inputMode="numeric" maxLength={4} value={pinEntry}
                  onChange={e => { setPinEntry(e.target.value.replace(/\D/g,"").slice(0,4)); setPinError(""); }}
                  style={{ ...S.settingInp, width:"100%", maxWidth:200, marginTop:8 }} placeholder="4-digit PIN" />
                <div style={{ display:"flex", gap:10, marginTop:10 }}>
                  <button onClick={() => { if (pinEntry===appSettings.parentPin) { setIsSettingsUnlocked(true); setPinError(""); } else setPinError("Wrong PIN."); }} className="fun-btn" style={S.btn()}>Unlock</button>
                </div>
                {pinError && <p style={{ color:"#ef4444", fontWeight:700, marginTop:8 }}>{pinError}</p>}
                {!appSettings.hasUnlockedSettingsOnce && <p style={{ ...S.sub, marginTop:8 }}>Default PIN: 1234</p>}
              </div>
            ) : (
              <>
                <div style={{ ...S.flat, marginBottom:14 }}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:10 }}>Profile names</div>
                  {Object.values(profiles).map(p => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <span style={{ ...S.sub, minWidth:80 }}>{p.id==="daughter"?"Daughter":"Test"}</span>
                      <input value={p.name} onChange={e => setProfiles(prev => ({ ...prev, [p.id]: { ...prev[p.id], name:e.target.value } }))} style={{ ...S.settingInp, flex:1, maxWidth:260 }} />
                    </div>
                  ))}
                </div>
                <div style={{ ...S.flat, marginBottom:14 }}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:8 }}>Change PIN</div>
                  <input type="password" inputMode="numeric" maxLength={4} value={newPin}
                    onChange={e => { setNewPin(e.target.value.replace(/\D/g,"").slice(0,4)); setPinError(""); setPinSuccess(""); }}
                    style={{ ...S.settingInp, width:"100%", maxWidth:200 }} placeholder="New 4-digit PIN" />
                  <div style={{ display:"flex", gap:10, marginTop:10 }}>
                    <button onClick={() => { if (!/^\d{4}$/.test(newPin)) { setPinError("Must be 4 digits."); return; } setAppSettings(p => ({ ...p, parentPin:newPin, hasUnlockedSettingsOnce:true })); setNewPin(""); setPinSuccess("PIN saved!"); }} className="fun-btn" style={S.btn()}>Save PIN</button>
                    <button onClick={() => { setIsSettingsUnlocked(false); setPinEntry(""); setNewPin(""); }} className="fun-btn" style={S.btn("#6b7280","#374151")}>Lock</button>
                  </div>
                  {pinError && <p style={{ color:"#ef4444", fontWeight:700, marginTop:8 }}>{pinError}</p>}
                  {pinSuccess && <p style={{ color:"#16a34a", fontWeight:700, marginTop:8 }}>{pinSuccess}</p>}
                </div>
                <div style={{ ...S.flat, marginBottom:14 }}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:6 }}>Cloud Sync PIN</div>
                  <p style={S.sub}>Your progress syncs between devices using a 6-digit PIN you choose. Enter the same PIN on any device to load your progress.</p>
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontWeight:700, marginBottom:8 }}>Current PIN: <span style={{ fontFamily:"monospace", fontSize:18, letterSpacing:4, background:"#f0f4ff", padding:"2px 8px", borderRadius:6 }}>{syncPin || "None"}</span></div>
                    <div style={{ ...S.sub, color: syncStatus==="saved"?"#16a34a":syncStatus==="error"?"#ef4444":syncStatus==="syncing"?"#f59e0b":"#6b7280" }}>
                      {syncStatus==="saved"?"✓ Saved to cloud":syncStatus==="error"?"✗ Sync error":syncStatus==="syncing"?"↑ Syncing…":syncPin?"Cloud sync active":"No PIN — progress saved locally only"}
                    </div>
                  </div>
                </div>
                <div style={S.flat}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:6 }}>Reset profiles</div>
                  <p style={S.sub}>Erases all progress, badges, and history.</p>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:10 }}>
                    <button onClick={() => resetProfile(activeProfileId)} className="fun-btn" style={S.btn("#ef4444","#7f1d1d")}>Reset My Progress</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
