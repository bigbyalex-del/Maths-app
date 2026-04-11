
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const STORAGE_KEY = "maths-app-v3";
const QUESTIONS_PER_SHEET = 36;
const PAGE_SIZE = 12; // questions per page (3 pages per session)
const ACCURACY_THRESHOLD = 95;   // % needed to pass each phase
const SPEED_PASSES_NEEDED = 3;    // consecutive speed passes to master a level
const REVIEW_Q_COUNT = 9;         // review questions mixed in during speed phase
const DEFAULT_APP_SETTINGS = { parentPin: "1234", hasUnlockedSettingsOnce: false, parentTierUnlocked: false, parentTierEmail: "" };
const STRIPE_PAYMENT_LINK = process.env.REACT_APP_STRIPE_PAYMENT_LINK || "https://buy.stripe.com/REPLACE_ME";

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
function stripMarkdown(text) {
  return (text || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

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
  // ── Common ────────────────────────────────────────────────────────────────
  { id:"first_accuracy",  tier:1, label:"First Step",       desc:"Passed your first accuracy check",              color:"#22c55e", image:"/badges/first_accuracy.png" },
  { id:"first_speed",     tier:1, label:"Speed Starter",    desc:"Earned your first speed pass",                  color:"#3b82f6", image:"/badges/first_speed.png" },
  { id:"first_master",    tier:1, label:"Level Master",     desc:"Mastered your first level",                     color:"#f59e0b", image:"/badges/first_master.png" },
  { id:"q100",            tier:1, label:"Centurion",        desc:"Answered 100 questions correctly",              color:"#f59e0b", image:"/badges/q100.png" },
  { id:"streak3",         tier:1, label:"On a Roll",        desc:"3-day practice streak",                         color:"#f97316", image:"/badges/streak3.png" },
  { id:"early_riser",     tier:1, label:"Early Riser",      desc:"Practised before 8am",                          color:"#fbbf24", image:"/badges/early_riser.png" },
  { id:"night_owl",       tier:1, label:"Night Owl",        desc:"Practised after 9pm",                           color:"#818cf8", image:"/badges/night_owl.png" },
  { id:"comeback_kid",    tier:1, label:"Comeback Kid",     desc:"Returned after a 5+ day break",                 color:"#f87171", image:"/badges/comeback_kid.png" },
  // ── Uncommon ──────────────────────────────────────────────────────────────
  { id:"five_master",     tier:2, label:"Rising Star",      desc:"Mastered 5 levels",                             color:"#a855f7", image:"/badges/five_master.png" },
  { id:"personal_best",   tier:2, label:"Personal Best",    desc:"Beat your best time on a level",                color:"#3b82f6", image:"/badges/personal_best.png" },
  { id:"perfect",         tier:2, label:"Perfect Sheet",    desc:"100% accuracy on a speed phase",                color:"#22c55e", image:"/badges/perfect.png" },
  { id:"q500",            tier:2, label:"500 Club",         desc:"Answered 500 questions",                        color:"#a855f7", image:"/badges/q500.png" },
  { id:"streak7",         tier:2, label:"Week Warrior",     desc:"7-day practice streak",                         color:"#ef4444", image:"/badges/streak7.png" },
  { id:"speed_demon",     tier:2, label:"Speed Demon",      desc:"Beat a target time by 25% or more",             color:"#f97316", image:"/badges/speed_demon.png" },
  { id:"double_perfect",  tier:2, label:"Double Trouble",   desc:"Two perfect sheets in a row",                   color:"#06b6d4", image:"/badges/double_perfect.png" },
  { id:"q250",            tier:2, label:"250 Club",         desc:"Answered 250 questions",                        color:"#22c55e", image:"/badges/q250.png" },
  // ── Rare ──────────────────────────────────────────────────────────────────
  { id:"ten_master",      tier:3, label:"Ten Strong",       desc:"Mastered 10 levels",                            color:"#ec4899", image:"/badges/ten_master.png" },
  { id:"halfway",         tier:3, label:"Halfway Hero",     desc:"Mastered half of all levels",                   color:"#06b6d4", image:"/badges/halfway.png" },
  { id:"q1000",           tier:3, label:"Thousand!",        desc:"Answered 1,000 questions",                      color:"#ef4444", image:"/badges/q1000.png" },
  { id:"streak14",        tier:3, label:"Fortnight+",       desc:"14-day practice streak",                        color:"#ffd700", image:"/badges/streak14.png" },
  { id:"fifteen_master",  tier:3, label:"The Adept",        desc:"Mastered 15 levels",                            color:"#8b5cf6", image:"/badges/fifteen_master.png" },
  { id:"triple_perfect",  tier:3, label:"Hat Trick",        desc:"Three perfect sheets in a row",                 color:"#14b8a6", image:"/badges/triple_perfect.png" },
  { id:"streak30",        tier:3, label:"Month of Maths",   desc:"30-day practice streak",                        color:"#f59e0b", image:"/badges/streak30.png" },
  { id:"q2500",           tier:3, label:"2500 Club",        desc:"Answered 2,500 questions",                      color:"#06b6d4", image:"/badges/q2500.png" },
  { id:"speed_master",    tier:3, label:"Speed Master",     desc:"Beat the target time on 5 different levels",    color:"#ef4444", image:"/badges/speed_master.png" },
  { id:"twenty_master",   tier:3, label:"The Expert",       desc:"Mastered 20 levels",                            color:"#ec4899", image:"/badges/twenty_master.png" },
  // ── Zone Trophies ─────────────────────────────────────────────────────────
  { id:"zone_foundations",    tier:3, label:"Foundations Champion", desc:"Cleared all Addition Foundations levels",  color:"#22c55e", image:"/badges/zone_foundations.png" },
  { id:"zone_add20",          tier:3, label:"Sky Champion",         desc:"Cleared all Addition to 20 levels",        color:"#3b82f6", image:"/badges/zone_add20.png" },
  { id:"zone_subtraction",    tier:3, label:"Castle Champion",      desc:"Cleared all Subtraction levels",           color:"#8b5cf6", image:"/badges/zone_subtraction.png" },
  { id:"zone_place_value",    tier:3, label:"Desert Champion",      desc:"Cleared all Place Value levels",           color:"#f59e0b", image:"/badges/zone_place_value.png" },
  { id:"zone_ops100",         tier:4, label:"Volcano Champion",     desc:"Cleared all Add & Subtract to 100 levels", color:"#ef4444", image:"/badges/zone_ops100.png" },
  { id:"zone_multiplication", tier:4, label:"Ocean Champion",       desc:"Cleared all Multiplication levels",        color:"#06b6d4", image:"/badges/zone_multiplication.png" },
  { id:"zone_division",       tier:4, label:"Forest Champion",      desc:"Cleared all Division levels",              color:"#14b8a6", image:"/badges/zone_division.png" },
  // ── Epic ──────────────────────────────────────────────────────────────────
  { id:"twentyfive_master",   tier:4, label:"The Scholar",          desc:"Mastered 25 levels",                       color:"#a855f7", image:"/badges/twentyfive_master.png" },
  { id:"streak60",            tier:4, label:"Two Month Titan",      desc:"60-day practice streak",                   color:"#f97316", image:"/badges/streak60.png" },
  { id:"q5000",               tier:4, label:"5K Legend",            desc:"Answered 5,000 questions",                 color:"#8b5cf6", image:"/badges/q5000.png" },
  { id:"flawless_ten",        tier:4, label:"Flawless",             desc:"10 perfect accuracy sheets in total",      color:"#14b8a6", image:"/badges/flawless_ten.png" },
  { id:"all_zones",           tier:4, label:"World Beater",         desc:"Cleared every single zone",                color:"#ffd700", image:"/badges/all_zones.png" },
  { id:"accuracy_master",     tier:4, label:"Precision Master",     desc:"Achieved 95%+ accuracy in 20 sessions",    color:"#22c55e", image:"/badges/accuracy_master.png" },
  // ── Legendary ─────────────────────────────────────────────────────────────
  { id:"all_master",          tier:5, label:"Maths Champion",       desc:"Mastered every single level!",             color:"#ffd700", image:"/badges/all_master.png" },
  { id:"q10000",              tier:5, label:"Ten Thousand",         desc:"Answered 10,000 questions — astonishing!", color:"#a855f7", image:"/badges/q10000.png" },
  { id:"streak100",           tier:5, label:"Centurion Streak",     desc:"100-day practice streak",                  color:"#ef4444", image:"/badges/streak100.png" },
  { id:"speed_legend",        tier:5, label:"Speed Legend",         desc:"Beat the target time on 10+ different levels", color:"#f97316", image:"/badges/speed_legend.png" },
  { id:"grandmaster",         tier:5, label:"Grandmaster",          desc:"All levels mastered and a 30-day streak",  color:"#ffd700", image:"/badges/grandmaster.png" },
  { id:"unstoppable",         tier:5, label:"Unstoppable",          desc:"A 100-day streak AND all levels mastered", color:"#ec4899", image:"/badges/unstoppable.png" },
  { id:"the_legend",          tier:5, label:"The Legend",           desc:"10,000 questions, all mastered, 60-day streak", color:"#ffd700", image:"/badges/the_legend.png" },
];

// ── Per-level badges (one per curriculum level, earned on mastery) ─────────────
const LEVEL_BADGE_DEFS = flatLevels.map(l => ({
  id: `level_${l.id}`,
  tier: 2,
  label: `${l.title}`,
  desc: `Mastered ${l.title} — ${l.skill}`,
  color: l.sectionColor,
  image: `/badges/level_${l.id}.png`,
  levelId: l.id,
  sectionId: l.sectionId,
  sectionName: l.sectionName,
}));

const ALL_BADGE_DEFS = [...BADGE_DEFS, ...LEVEL_BADGE_DEFS];

const TIER_INFO = {
  1: { label:"Common",    color:"#6b7280" },
  2: { label:"Uncommon",  color:"#22c55e" },
  3: { label:"Rare",      color:"#3b82f6" },
  4: { label:"Epic",      color:"#a855f7" },
  5: { label:"Legendary", color:"#f59e0b" },
};

const CHARACTERS = [
  { id:"mage",    label:"Mage",    desc:"Spell-caster",     color:"#a855f7" },
  { id:"knight",  label:"Knight",  desc:"Brave warrior",    color:"#f59e0b" },
  { id:"archer",  label:"Archer",  desc:"Sharp-eyed rogue", color:"#22c55e" },
  { id:"scholar", label:"Scholar", desc:"Book-reader",      color:"#3b82f6" },
  { id:"bard",    label:"Bard",    desc:"Music-maker",      color:"#ef4444" },
];

function computeNewBadges(profile, sessionData) {
  const { accuracy, isSpeedPhase, newSpeedPasses, newMasteredCount, newTotalQ, newStreak,
          isBestTime, levelProgress, time, masteryTime, currentHour = -1,
          newConsecutivePerfects = 0, daysSinceLastPractice = 0, newHighAccuracySessions = 0,
          justMasteredLevelId = null } = sessionData;
  const already = new Set(profile.badges || []);
  const earned = [];
  const add = (id) => { if (!already.has(id)) earned.push(id); };

  // ── Common ───────────────────────────────────────────────────────────────
  if (!isSpeedPhase && accuracy >= ACCURACY_THRESHOLD)                       add("first_accuracy");
  if (isSpeedPhase && accuracy >= ACCURACY_THRESHOLD && newSpeedPasses >= 1) add("first_speed");
  if (newMasteredCount >= 1)                                                 add("first_master");
  if (newTotalQ >= 100)                                                      add("q100");
  if (newStreak >= 3)                                                        add("streak3");
  if (currentHour >= 0 && currentHour < 8)                                  add("early_riser");
  if (currentHour >= 21)                                                     add("night_owl");
  if (daysSinceLastPractice >= 5)                                            add("comeback_kid");

  // ── Uncommon ─────────────────────────────────────────────────────────────
  if (newMasteredCount >= 5)                                                 add("five_master");
  if (isBestTime)                                                            add("personal_best");
  if (isSpeedPhase && accuracy === 100)                                      add("perfect");
  if (newTotalQ >= 250)                                                      add("q250");
  if (newTotalQ >= 500)                                                      add("q500");
  if (newStreak >= 7)                                                        add("streak7");
  if (isSpeedPhase && masteryTime && time <= masteryTime * 0.75)             add("speed_demon");
  if (newConsecutivePerfects >= 2)                                           add("double_perfect");

  // ── Rare ─────────────────────────────────────────────────────────────────
  if (newMasteredCount >= 10)                                                add("ten_master");
  if (newMasteredCount >= Math.floor(flatLevels.length / 2))                add("halfway");
  if (newTotalQ >= 1000)                                                     add("q1000");
  if (newStreak >= 14)                                                       add("streak14");
  if (newMasteredCount >= 15)                                                add("fifteen_master");
  if (newConsecutivePerfects >= 3)                                           add("triple_perfect");
  if (newStreak >= 30)                                                       add("streak30");
  if (newTotalQ >= 2500)                                                     add("q2500");
  if (newMasteredCount >= 20)                                                add("twenty_master");
  const levelsBeatTarget = levelProgress ? flatLevels.filter(l => {
    const p = levelProgress[l.id];
    return p?.bestTime != null && p.bestTime <= l.masteryTime;
  }).length : 0;
  if (levelsBeatTarget >= 5)                                                 add("speed_master");

  // Zone trophies
  if (levelProgress) {
    const secMastered = (id) => { const s = CURRICULUM.find(c => c.id === id); return s && s.levels.every(l => levelProgress[l.id]?.state === LS.MASTERED); };
    if (secMastered("foundations"))    add("zone_foundations");
    if (secMastered("add-20"))         add("zone_add20");
    if (secMastered("subtraction"))    add("zone_subtraction");
    if (secMastered("place-value"))    add("zone_place_value");
    if (secMastered("ops-100"))        add("zone_ops100");
    if (secMastered("multiplication")) add("zone_multiplication");
    if (secMastered("division"))       add("zone_division");
  }

  // ── Epic ─────────────────────────────────────────────────────────────────
  if (newMasteredCount >= 25)                                                add("twentyfive_master");
  if (newStreak >= 60)                                                       add("streak60");
  if (newTotalQ >= 5000)                                                     add("q5000");
  if (isSpeedPhase && accuracy === 100 && (profile.perfectSheets || 0) >= 10) add("flawless_ten");
  if (levelProgress && CURRICULUM.every(s => s.levels.every(l => levelProgress[l.id]?.state === LS.MASTERED))) add("all_zones");
  if (newHighAccuracySessions >= 20)                                         add("accuracy_master");

  // ── Legendary ────────────────────────────────────────────────────────────
  if (newMasteredCount >= flatLevels.length)                                 add("all_master");
  if (newTotalQ >= 10000)                                                    add("q10000");
  if (newStreak >= 100)                                                      add("streak100");
  if (levelsBeatTarget >= 10)                                                add("speed_legend");
  if (newMasteredCount >= flatLevels.length && newStreak >= 30)             add("grandmaster");
  if (newMasteredCount >= flatLevels.length && newStreak >= 100)            add("unstoppable");
  if (newMasteredCount >= flatLevels.length && newTotalQ >= 10000 && newStreak >= 60) add("the_legend");

  // ── Level badges ─────────────────────────────────────────────────────────────
  if (justMasteredLevelId) {
    add(`level_${justMasteredLevelId}`);
  }

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
const EMPTY_PROFILE = (id, name) => ({ id, name, character: "mage", totalQuestions: 0, streak: 0, bestStreak: 0, lastCompletedDate: "", history: [], levelProgress: {}, badges: [], placementDone: false });

// ── App phases ────────────────────────────────────────────────────────────────
const PHASE = { LANDING:"landing", WELCOME:"welcome", SIGNUP:"signup", PIN_ENTRY:"pin_entry", PLACEMENT:"placement", APP:"app" };

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

// ── LandingPage ───────────────────────────────────────────────────────────────
function LandingPage({ onStart, onReturn }) {
  const PX = "'Press Start 2P', monospace";
  const bg = "#0d0a1a";
  const bgAlt = "#120e24";
  const gold = "#fbbf24";
  const purpleLight = "#a78bfa";
  const text = "#e2d4ff";
  const textSub = "#9b80d4";
  const border = "#2a1f4a";

  const Section = ({ children, style }) => (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"0 20px", ...style }}>{children}</div>
  );
  const Tag = ({ children, color }) => (
    <span style={{ display:"inline-block", padding:"3px 12px", border:`2px solid ${color||gold}`,
      fontFamily:PX, fontSize:7, color:color||gold, lineHeight:2, marginBottom:16 }}>{children}</span>
  );
  const H2 = ({ children }) => (
    <div style={{ fontFamily:PX, fontSize:13, color:gold, lineHeight:1.8, marginBottom:16, textAlign:"center" }}>{children}</div>
  );

  const methods = [
    { icon:"/meth-accuracy.png", title:"Accuracy First", sub:"Speed Second",
      body:"Children master each concept at their own pace before any time pressure is introduced — matching the evidence-based Kumon and Singapore Maths methods.",
      science:"Research shows that drilling for speed before accuracy is cemented leads to maths anxiety. Our two-phase system ensures understanding comes first.",
      color:"#22c55e" },
    { icon:"/meth-spaced.png", title:"Spaced Repetition", sub:"Never Forget",
      body:"Mastered topics are automatically reintroduced during later sessions so knowledge sticks in long-term memory — not just cramming for the next test.",
      science:"Spaced practice is one of the most replicated findings in cognitive science (Ebbinghaus, 1885 — Cepeda et al., 2006). We schedule review automatically.",
      color:"#3b82f6" },
    { icon:"/meth-interleaved.png", title:"Interleaved Practice", sub:"Mix It Up",
      body:"Questions from recently mastered levels are woven into each new session — proven to improve retention by up to 40% compared to blocked practice.",
      science:"Rohrer & Taylor (2007) found interleaved maths practice outperformed blocked practice on delayed tests by a significant margin.",
      color:"#a855f7" },
  ];

  const features = [
    { icon:"/feat-ai-hint.png",   title:"AI Hint System",        body:"Claude AI gives personalised hints — never just the answer. Teaches children how to think, not just what to write.", color:"#7c3aed" },
    { icon:"/feat-badges.png",    title:"40+ Badges & Trophies", body:"From 'First Step' to 'Grandmaster' — a full progression system that keeps children motivated and proud.", color:"#f59e0b" },
    { icon:"/feat-streaks.png",   title:"Daily Streaks & Coins", body:"Built-in habit loop. Coins for every correct answer, streaks for daily practice, daily bonus quest to beat.", color:"#ef4444" },
    { icon:"/feat-parent.png",    title:"Parent Dashboard",      body:"AI progress reports, goal tracking, session history and a goal-check feature so parents stay fully in the loop.", color:"#06b6d4" },
    { icon:"/feat-homework.png",  title:"Homework Scanner",      body:"Photograph any worksheet and the app turns it into interactive practice — perfect for school homework nights.", color:"#22c55e" },
    { icon:"/feat-journey.png",   title:"36-Level Journey",      body:"From +1 facts all the way to mixed multiplication and division — a complete KS1 & KS2 journey mapped out.", color:"#f97316" },
  ];

  const steps = [
    { n:"01", title:"Take the Placement Test", body:"A quick 3-question-per-stage adaptive test places your child at exactly the right level — no guesswork.", color:gold },
    { n:"02", title:"Pick Your Hero",          body:"Choose from 5 pixel art characters. Your hero cheers you on, reacts to correct answers, and grows with you.", color:purpleLight },
    { n:"03", title:"Level Up Every Day",      body:"Work through accuracy phases, then speed phases. Earn coins, badges and unlock new zones as you master each skill.", color:"#22c55e" },
  ];

  return (
    <div style={{ background:bg, color:text, fontFamily:"'Nunito', sans-serif", overflowX:"hidden" }}>

      {/* ── HERO ── */}
      <div style={{ position:"relative", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover",
        backgroundPosition:"center top", padding:"56px 24px 48px" }}>
        <div style={{ position:"absolute", inset:0, background:"rgba(13,10,26,0.80)" }} />
        <div style={{ position:"relative", textAlign:"center", maxWidth:640, margin:"0 auto" }}>
          <img src="/logo-crest.png" alt="Get Maths Mastery crest"
            style={{ imageRendering:"pixelated", width:72, height:72, marginBottom:12,
              filter:"drop-shadow(0 0 16px rgba(251,191,36,0.5))" }} />
          <div style={{ fontFamily:PX, fontSize:8, color:textSub, letterSpacing:3, marginBottom:10, lineHeight:2 }}>
            FREE · NO ADS · NO SUBSCRIPTION
          </div>
          <h1 style={{ fontFamily:PX, fontSize:18, color:gold, lineHeight:1.7, marginBottom:10,
            textShadow:"0 0 24px rgba(251,191,36,0.7), 0 0 48px rgba(251,191,36,0.3)" }}>
            Get Maths<br/>Mastery
          </h1>
          <p style={{ fontSize:17, fontWeight:800, color:text, lineHeight:1.6, marginBottom:8 }}>
            The RPG maths app that turns practice into an adventure.
          </p>
          <p style={{ fontSize:13, color:textSub, fontWeight:700, lineHeight:1.7, marginBottom:28, maxWidth:460, margin:"0 auto 28px" }}>
            Science-backed methodology. AI-powered hints. 40+ badges to earn.
            Built for KS1 &amp; KS2 children who want to level up.
          </p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", marginBottom:24 }}>
            <button onClick={onStart} style={{ border:`4px solid ${gold}`, background:gold, color:"#111",
              fontFamily:PX, fontSize:10, padding:"14px 24px", cursor:"pointer",
              boxShadow:`5px 5px 0 #92400e`, lineHeight:1.8 }}
              onMouseEnter={e=>e.target.style.transform="translate(2px,2px)"}
              onMouseLeave={e=>e.target.style.transform=""}>
              Start Free →
            </button>
            <button onClick={onReturn} style={{ border:`4px solid ${border}`, background:"rgba(255,255,255,0.07)", color:text,
              fontFamily:PX, fontSize:10, padding:"14px 24px", cursor:"pointer",
              boxShadow:`5px 5px 0 #06030f`, lineHeight:1.8 }}>
              I have a PIN
            </button>
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:20, flexWrap:"wrap", marginBottom:32 }}>
            {["KS1 & KS2","36 Levels","AI Hints","Free Forever"].map(t => (
              <div key={t} style={{ fontSize:12, fontWeight:800, color:textSub, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ color:gold }}>★</span> {t}
              </div>
            ))}
          </div>
          {/* scroll nudge */}
          <div style={{ fontSize:11, color:`${textSub}88`, fontWeight:700, letterSpacing:2 }}>
            ↓ &nbsp; scroll to explore
          </div>
        </div>
      </div>

      {/* ── CHARACTERS ── */}
      <div style={{ background:bgAlt, borderTop:`3px solid ${border}`, borderBottom:`3px solid ${border}`, padding:"48px 20px" }}>
        <Section>
          <Tag>Choose your hero</Tag>
          <H2>Who will you become?</H2>
          <p style={{ textAlign:"center", color:textSub, fontWeight:700, fontSize:14, marginBottom:32, maxWidth:520, margin:"0 auto 32px" }}>
            Every player picks a pixel art character at signup. Your hero reacts to correct answers and cheers you on through every level.
          </p>
          <div style={{ display:"flex", justifyContent:"center", gap:16, flexWrap:"wrap" }}>
            {CHARACTERS.map(ch => (
              <div key={ch.id} style={{ textAlign:"center", padding:"16px 12px", border:`3px solid ${border}`,
                background:bg, minWidth:100, flex:"0 0 auto" }}>
                <img src={`/char-${ch.id}.png`} alt={ch.label}
                  style={{ imageRendering:"pixelated", width:72, height:72, display:"block", margin:"0 auto 8px",
                    filter:`drop-shadow(0 0 8px ${ch.color}66)` }} />
                <div style={{ fontFamily:PX, fontSize:8, color:ch.color, lineHeight:1.8 }}>{ch.label}</div>
                <div style={{ fontSize:11, color:textSub, fontWeight:700, marginTop:4 }}>{ch.desc}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── THE METHOD ── */}
      <div style={{ padding:"64px 20px" }}>
        <Section>
          <div style={{ textAlign:"center", marginBottom:48 }}>
            <Tag>The science</Tag>
            <H2>Why it actually works</H2>
            <p style={{ color:textSub, fontWeight:700, fontSize:14, maxWidth:560, margin:"0 auto", lineHeight:1.7 }}>
              Most maths apps focus on engagement. We focus on <em style={{ color:gold }}>retention</em>. Every part of Get Maths Mastery is built on peer-reviewed cognitive science.
            </p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:20 }}>
            {methods.map(m => (
              <div key={m.title} style={{ background:bgAlt, border:`3px solid ${border}`,
                boxShadow:`4px 4px 0 #06030f`, padding:24 }}>
                <img src={m.icon} alt="" style={{ width:40, height:40, imageRendering:"pixelated", marginBottom:12, filter:`drop-shadow(0 0 6px ${m.color}88)` }} />
                <div style={{ fontFamily:PX, fontSize:10, color:m.color, lineHeight:1.8, marginBottom:4 }}>{m.title}</div>
                <div style={{ fontSize:11, color:textSub, fontWeight:800, marginBottom:12 }}>{m.sub}</div>
                <p style={{ fontSize:13, color:text, fontWeight:700, lineHeight:1.7, marginBottom:16 }}>{m.body}</p>
                <div style={{ padding:"10px 14px", background:`${m.color}11`, border:`2px solid ${m.color}44`,
                  fontSize:11, color:textSub, fontWeight:700, lineHeight:1.6, fontStyle:"italic" }}>
                  📖 {m.science}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── FEATURES ── */}
      <div style={{ background:bgAlt, borderTop:`3px solid ${border}`, borderBottom:`3px solid ${border}`, padding:"64px 20px" }}>
        <Section>
          <div style={{ textAlign:"center", marginBottom:48 }}>
            <Tag color={purpleLight}>Everything included</Tag>
            <H2>Packed with features</H2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:20 }}>
            {features.map(f => (
              <div key={f.title} style={{ background:bg, border:`3px solid ${border}`,
                boxShadow:`4px 4px 0 #06030f`, padding:24, display:"flex", gap:16, alignItems:"flex-start" }}>
                <img src={f.icon} alt="" style={{ width:40, height:40, imageRendering:"pixelated", flexShrink:0,
                  filter:`drop-shadow(0 0 6px ${f.color}66)` }} />
                <div>
                  <div style={{ fontFamily:PX, fontSize:9, color:f.color, lineHeight:1.8, marginBottom:6 }}>{f.title}</div>
                  <p style={{ fontSize:13, color:textSub, fontWeight:700, lineHeight:1.6, margin:0 }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div style={{ padding:"64px 20px" }}>
        <Section>
          <div style={{ textAlign:"center", marginBottom:48 }}>
            <Tag color="#22c55e">Simple start</Tag>
            <H2>Up and running in 2 minutes</H2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:20 }}>
            {steps.map(s => (
              <div key={s.n} style={{ background:bgAlt, border:`3px solid ${border}`,
                boxShadow:`4px 4px 0 #06030f`, padding:28, textAlign:"center" }}>
                <div style={{ fontFamily:PX, fontSize:28, color:`${s.color}44`, lineHeight:1, marginBottom:12 }}>{s.n}</div>
                <div style={{ fontFamily:PX, fontSize:9, color:s.color, lineHeight:1.8, marginBottom:10 }}>{s.title}</div>
                <p style={{ fontSize:13, color:textSub, fontWeight:700, lineHeight:1.6, margin:0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── CURRICULUM STRIP ── */}
      <div style={{ background:bgAlt, borderTop:`3px solid ${border}`, borderBottom:`3px solid ${border}`, padding:"40px 20px" }}>
        <Section>
          <H2>Full KS1 & KS2 curriculum covered</H2>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
            {CURRICULUM.map(s => (
              <div key={s.id} style={{ padding:"8px 16px", border:`2px solid ${s.color}66`, background:`${s.color}11`,
                fontFamily:PX, fontSize:7, color:s.color, lineHeight:2 }}>
                {s.name}
              </div>
            ))}
          </div>
          <p style={{ textAlign:"center", color:textSub, fontWeight:700, fontSize:13, marginTop:20 }}>
            36 levels across 7 zones · Adaptive placement · No wasted time
          </p>
        </Section>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{ position:"relative", padding:"80px 20px", backgroundImage:"url('/backdrop-1.png')",
        backgroundSize:"cover", backgroundPosition:"center bottom" }}>
        <div style={{ position:"absolute", inset:0, background:"rgba(13,10,26,0.85)" }} />
        <div style={{ position:"relative", textAlign:"center" }}>
          <img src="/logo-crest.png" alt="" style={{ imageRendering:"pixelated", width:72, marginBottom:16,
            filter:"drop-shadow(0 0 16px rgba(251,191,36,0.5))" }} />
          <div style={{ fontFamily:PX, fontSize:14, color:gold, lineHeight:1.8, marginBottom:12 }}>
            Ready to begin?
          </div>
          <p style={{ fontSize:15, color:text, fontWeight:800, lineHeight:1.7, marginBottom:32, maxWidth:460, margin:"0 auto 32px" }}>
            Free forever. No ads. No subscription. Just maths mastery.
          </p>
          <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={onStart} style={{ border:`4px solid ${gold}`, background:gold, color:"#111",
              fontFamily:PX, fontSize:10, padding:"16px 32px", cursor:"pointer",
              boxShadow:`6px 6px 0 #92400e`, lineHeight:1.8 }}
              onMouseEnter={e=>e.target.style.transform="translate(2px,2px)"}
              onMouseLeave={e=>e.target.style.transform=""}>
              Start your quest →
            </button>
            <button onClick={onReturn} style={{ border:`4px solid ${border}`, background:"rgba(255,255,255,0.07)", color:text,
              fontFamily:PX, fontSize:10, padding:"16px 32px", cursor:"pointer",
              boxShadow:`6px 6px 0 #06030f`, lineHeight:1.8 }}>
              I have a PIN
            </button>
          </div>
          <p style={{ marginTop:24, fontSize:12, color:textSub, fontWeight:700 }}>
            getmathsmastery.com · Built with love for curious kids
          </p>
        </div>
      </div>

    </div>
  );
}

// ── UpgradeModal ──────────────────────────────────────────────────────────────
function UpgradeModal({ onClose, onUnlocked, paymentLink }) {
  const PX = "'Press Start 2P', monospace";
  const [tab, setTab] = useState("info"); // info | activate
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const perks = [
    { icon:"🤖", label:"AI Progress Chat",     desc:"Ask Claude anything about your child's progress" },
    { icon:"📦", label:"Custom Question Packs", desc:"Generate 36 questions on any topic instantly" },
    { icon:"📷", label:"Homework Scanner",      desc:"Photograph any worksheet, turn it into practice" },
    { icon:"🎯", label:"AI Goal Tracking",      desc:"Set goals, get AI assessments on whether you're on track" },
  ];

  async function verifyEmail() {
    if (!email.trim() || !email.includes("@")) { setError("Please enter a valid email."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/.netlify/functions/verify-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.active) {
        onUnlocked(email.trim());
      } else {
        setError("No active subscription found for that email. Please subscribe first, or check the email you used with Stripe.");
      }
    } catch {
      setError("Could not verify — please try again.");
    }
    setLoading(false);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.8)", backdropFilter:"blur(4px)", padding:16, cursor:"pointer" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#120e24", border:"4px solid #fbbf24",
        boxShadow:"8px 8px 0 #06030f", padding:28, maxWidth:420, width:"100%", cursor:"default" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>👑</div>
          <div style={{ fontFamily:PX, fontSize:11, color:"#fbbf24", lineHeight:1.8, marginBottom:4 }}>Parent Features</div>
          <div style={{ fontSize:13, color:"#9b80d4", fontWeight:700 }}>Unlock AI-powered tools for parents</div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0, marginBottom:20, border:"3px solid #2a1f4a" }}>
          {[["info","What you get"],["activate","Activate"]].map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"8px", border:"none",
              background: tab===t?"#7c3aed":"transparent", color: tab===t?"#fff":"#9b80d4",
              fontFamily:PX, fontSize:7, cursor:"pointer", lineHeight:2 }}>{label}</button>
          ))}
        </div>

        {tab === "info" && (
          <>
            <div style={{ marginBottom:16 }}>
              {perks.map(p => (
                <div key={p.label} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:12 }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{p.icon}</span>
                  <div>
                    <div style={{ fontWeight:900, fontSize:13, color:"#e2d4ff" }}>{p.label}</div>
                    <div style={{ fontSize:12, color:"#9b80d4", fontWeight:700 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign:"center", padding:"14px", background:"rgba(251,191,36,0.08)",
              border:"3px solid #fbbf24", marginBottom:16 }}>
              <div style={{ fontFamily:PX, fontSize:14, color:"#fbbf24", lineHeight:1.8 }}>£3.99 / month</div>
              <div style={{ fontSize:12, color:"#9b80d4", fontWeight:700, marginTop:4 }}>Cancel anytime · Instant access</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { window.open(paymentLink, "_blank"); setTab("activate"); }}
                style={{ flex:1, border:"4px solid #fbbf24", background:"#fbbf24", color:"#111",
                  fontFamily:PX, fontSize:9, padding:"12px", cursor:"pointer", boxShadow:"4px 4px 0 #92400e", lineHeight:1.8 }}>
                Subscribe →
              </button>
              <button onClick={onClose} style={{ border:"3px solid #2a1f4a", background:"transparent",
                color:"#9b80d4", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>
                ✕
              </button>
            </div>
          </>
        )}

        {tab === "activate" && (
          <>
            <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, lineHeight:1.6, marginBottom:16 }}>
              Already subscribed? Enter the email you used with Stripe to activate on this device.
            </p>
            <input autoFocus type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
              onKeyDown={e => e.key==="Enter" && verifyEmail()}
              placeholder="your@email.com"
              style={{ border:"3px solid #7c3aed", background:"#1a1035", color:"#e2d4ff", padding:"10px 14px",
                fontSize:14, fontWeight:700, width:"100%", boxSizing:"border-box", marginBottom:12, outline:"none" }} />
            {error && <p style={{ color:"#ef4444", fontWeight:800, fontSize:12, marginBottom:10 }}>{error}</p>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={verifyEmail} disabled={loading}
                style={{ flex:1, border:"4px solid #7c3aed", background:"#7c3aed", color:"#fff",
                  fontFamily:PX, fontSize:9, padding:"12px", cursor:"pointer", boxShadow:"4px 4px 0 #3b0764", lineHeight:1.8 }}>
                {loading ? "Checking…" : "Activate →"}
              </button>
              <button onClick={onClose} style={{ border:"3px solid #2a1f4a", background:"transparent",
                color:"#9b80d4", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>
                ✕
              </button>
            </div>
            <p style={{ fontSize:11, color:"#4a3668", fontWeight:700, marginTop:12, textAlign:"center" }}>
              Not subscribed yet?{" "}
              <span onClick={() => setTab("info")} style={{ color:"#fbbf24", cursor:"pointer", textDecoration:"underline" }}>
                See what's included
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── WelcomeScreen ─────────────────────────────────────────────────────────────
function WelcomeScreen({ onNew, onReturn }) {
  const PX = "'Press Start 2P', monospace";
  return (
    <div style={{ minHeight:"100vh", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"rgba(10,10,30,0.82)", border:"4px solid #ffd700", boxShadow:"8px 8px 0 #000", padding:36, maxWidth:440, width:"100%", textAlign:"center", backdropFilter:"blur(2px)" }}>
        <img src="/maths-master.png" alt="The Maths Master" style={{ imageRendering:"pixelated", width:140, height:"auto", marginBottom:12 }} />
        <h1 style={{ fontFamily:PX, fontSize:14, color:"#ffd700", lineHeight:1.8, marginBottom:8 }}>Get Maths Mastery</h1>
        <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, lineHeight:1.6, marginBottom:8, fontStyle:"italic" }}>
          "I am the Maths Master. Prove your skill."
        </p>
        <p style={{ fontSize:13, color:"#e2e8f0", fontWeight:700, lineHeight:1.6, marginBottom:32 }}>
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
  const [character, setCharacter] = useState("mage");
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
      setError(""); setStep(4);
    } else if (step === 4) {
      onComplete({ name: name.trim(), age: parseInt(age), pin, character });
    }
  }

  const inputStyle = { border:"3px solid #4f46e5", padding:"12px 16px", fontSize:18, fontFamily:"'Nunito',sans-serif", fontWeight:700, width:"100%", boxSizing:"border-box", outline:"none" };
  const btnStyle = { border:"4px solid #4f46e5", background:"#4f46e5", color:"#fff", fontFamily:PX, fontSize:10, padding:"14px", cursor:"pointer", boxShadow:"5px 5px 0 #312e81", width:"100%", lineHeight:1.8 };

  return (
    <div style={{ minHeight:"100vh", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"rgba(10,10,30,0.88)", border:"4px solid #ffd700", boxShadow:"8px 8px 0 #000", padding:32, maxWidth:460, width:"100%", backdropFilter:"blur(2px)" }}>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {[1,2,3,4].map(s => <div key={s} style={{ flex:1, height:6, borderRadius:3, background: s<=step?"#ffd700":"rgba(255,255,255,0.2)", transition:"background 0.3s" }} />)}
        </div>

        {step === 1 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:20 }}>Step 1: Who are you?</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:800, color:"#e2e8f0", display:"block", marginBottom:6 }}>Your name</label>
              <input autoFocus value={name} onChange={e => { setName(e.target.value); setError(""); }}
                onKeyDown={e => e.key==="Enter" && nextStep()}
                style={inputStyle} placeholder="e.g. Emma" maxLength={30} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:800, color:"#e2e8f0", display:"block", marginBottom:6 }}>Your age</label>
              <input type="number" value={age} onChange={e => { setAge(e.target.value); setError(""); }}
                onKeyDown={e => e.key==="Enter" && nextStep()}
                style={{ ...inputStyle, width:120 }} placeholder="e.g. 8" min={4} max={16} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:12 }}>Step 2: Choose a PIN</div>
            <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
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
            <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:12 }}>Step 3: Confirm PIN</div>
            <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
              Your PIN is <strong style={{ fontFamily:"monospace", fontSize:20, letterSpacing:4, color:"#ffd700" }}>{pin}</strong><br/>
              Type it again to confirm.
            </p>
            <input autoFocus type="number" inputMode="numeric" value={pinConfirm}
              onChange={e => { setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,6)); setError(""); }}
              onKeyDown={e => e.key==="Enter" && nextStep()}
              style={{ ...inputStyle, fontSize:28, letterSpacing:8, textAlign:"center" }} placeholder="——————" maxLength={6} />
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:8 }}>Step 4: Pick your hero!</div>
            <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, lineHeight:1.6, marginBottom:16 }}>
              Choose a character to represent you on your quest.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:8 }}>
              {CHARACTERS.map(ch => (
                <div key={ch.id} onClick={() => setCharacter(ch.id)}
                  style={{ cursor:"pointer", textAlign:"center", padding:"8px 4px", border: character===ch.id?`3px solid ${ch.color}`:"3px solid transparent",
                    background: character===ch.id?"rgba(255,255,255,0.08)":"transparent",
                    boxShadow: character===ch.id?`0 0 12px ${ch.color}55`:"none",
                    transition:"all 0.15s" }}>
                  <img src={`/char-${ch.id}.png`} alt={ch.label}
                    style={{ imageRendering:"pixelated", width:52, height:52, display:"block", margin:"0 auto 4px" }} />
                  <div style={{ fontSize:9, fontFamily:PX, color: character===ch.id?ch.color:"#c7d2fe", lineHeight:1.4 }}>{ch.label}</div>
                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, marginTop:2 }}>{ch.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color:"#ef4444", fontWeight:800, fontSize:13, marginTop:10 }}>{error}</p>}

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={() => step===1 ? onBack() : setStep(s=>s-1)}
            style={{ border:"3px solid rgba(255,255,255,0.3)", background:"rgba(255,255,255,0.1)", color:"#e2e8f0", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>
            Back
          </button>
          <button onClick={nextStep} style={{ ...btnStyle, flex:1, padding:"12px" }}>
            {step === 4 ? "Begin quest!" : "Next →"}
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
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  return (
    <div style={{ minHeight:"100vh", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"rgba(10,10,30,0.88)", border:"4px solid #ffd700", boxShadow:"8px 8px 0 #000", padding:32, maxWidth:400, width:"100%", textAlign:"center", backdropFilter:"blur(2px)" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔑</div>
        <div style={{ fontFamily:PX, fontSize:11, color:"#ffd700", marginBottom:16 }}>Sign in</div>
        <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, marginBottom:20 }}>Type your 6-digit PIN to load your progress.</p>
        <input autoFocus type="number" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,6))}
          onKeyDown={e => e.key==="Enter" && pin.length===6 && onSubmit(pin, keepSignedIn)}
          style={{ border:"3px solid #ffd700", padding:"12px", fontSize:28, fontFamily:"monospace", letterSpacing:8, textAlign:"center", width:"100%", boxSizing:"border-box", marginBottom:16, background:"rgba(255,255,255,0.1)", color:"#fff" }}
          placeholder="——————" maxLength={6} />
        {error && <p style={{ color:"#ef4444", fontWeight:800, fontSize:13, marginBottom:12 }}>{error}</p>}
        <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:20, cursor:"pointer" }}>
          <input type="checkbox" checked={keepSignedIn} onChange={e => setKeepSignedIn(e.target.checked)}
            style={{ width:18, height:18, accentColor:"#fbbf24", cursor:"pointer" }} />
          <span style={{ fontSize:13, fontWeight:800, color:"#c7d2fe" }}>Stay signed in on this device</span>
        </label>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onBack} style={{ border:"3px solid rgba(255,255,255,0.3)", background:"rgba(255,255,255,0.1)", color:"#e2e8f0", fontFamily:PX, fontSize:9, padding:"12px 14px", cursor:"pointer" }}>Back</button>
          <button onClick={() => onSubmit(pin, keepSignedIn)} disabled={pin.length!==6||loading}
            style={{ flex:1, border:"4px solid #ffd700", background: pin.length===6&&!loading?"#ffd700":"rgba(255,255,255,0.1)", color: pin.length===6&&!loading?"#111":"#9ca3af", fontFamily:PX, fontSize:10, padding:"12px", cursor: pin.length===6&&!loading?"pointer":"not-allowed", boxShadow: pin.length===6&&!loading?"5px 5px 0 #b8860b":"none" }}>
            {loading ? "Loading…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PlacementTest (block-based, speed-measured) ───────────────────────────────
// 3 questions per stage. Need 2/3 correct + avg speed ≤ threshold to advance.
// Speed measured silently — no countdown shown to child.
function PlacementTest({ profileName, startStage, onComplete, onParentOverride, parentPin, character }) {
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

      // Conservative bias: always place one stage below where test suggests
      const conservativePlace = (idx) => Math.max(0, idx - 1);

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
          // Passed the highest stage — place one below top (conservative)
          setPlacedStageIdx(conservativePlace(stageIdx));
          setDone(true);
        }
      } else if (slowPass) {
        // Correct but slow — place two below current (conservative)
        setPlacedStageIdx(Math.max(0, stageIdx - 2));
        setDone(true);
      } else {
        // Failed — if we've already passed a lower stage, place conservatively below that
        if (lastPassedStage !== null) {
          setPlacedStageIdx(conservativePlace(lastPassedStage));
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
      <div style={{ minHeight:"100vh", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
        <div style={{ background:"rgba(10,10,30,0.88)", border:"4px solid #ffd700", padding:32, maxWidth:460, width:"100%", boxShadow:"8px 8px 0 #000", textAlign:"center", backdropFilter:"blur(2px)" }}>
          <img src={`/char-${character||"mage"}.png`} alt="Your hero" style={{ imageRendering:"pixelated", width:120, height:"auto", marginBottom:12 }} />
          <div style={{ fontFamily:PX, fontSize:12, color:"#ffd700", marginBottom:8 }}>Placement Complete!</div>
          <p style={{ fontSize:13, color:"#c7d2fe", fontWeight:700, fontStyle:"italic", marginBottom:8 }}>
            "I have assessed your abilities, {profileName}."
          </p>
          <p style={{ fontSize:13, color:"#e2e8f0", fontWeight:700, lineHeight:1.6, marginBottom:20 }}>
            Based on your speed and accuracy, you begin here:
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
    <div style={{ minHeight:"100vh", backgroundImage:"url('/backdrop-1.png')", backgroundSize:"cover", backgroundPosition:"center", display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ background:"rgba(10,10,30,0.88)", border:"4px solid #ffd700", padding:32, maxWidth:460, width:"100%", boxShadow:"8px 8px 0 #000", backdropFilter:"blur(2px)" }}>
        <div style={{ fontFamily:PX, fontSize:10, color:"#ffd700", marginBottom:4 }}>Placement Test</div>
        <p style={{ fontSize:12, color:"#c7d2fe", fontWeight:700, marginBottom:16 }}>Finding your perfect starting level, {profileName}!</p>

        {/* Stage progress */}
        <div style={{ display:"flex", gap:4, marginBottom:8 }}>
          {PLACEMENT_STAGES.map((_, i) => (
            <div key={i} style={{ flex:1, height:8, borderRadius:4, background: i < stageIdx?"#4f46e5":i===stageIdx?"#a5b4fc":"#e5e7eb", transition:"background 0.3s" }} />
          ))}
        </div>
        {/* Block progress dots */}
        <div style={{ display:"flex", gap:8, marginBottom:20, justifyContent:"center" }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width:14, height:14, borderRadius:"50%", border:"2px solid #ffd700",
              background: i < blockQ ? "#22c55e" : i===blockQ ? "#ffd700" : "rgba(255,255,255,0.1)", transition:"background 0.3s" }} />
          ))}
        </div>
        <div style={{ fontSize:12, color:"#c7d2fe", fontWeight:700, marginBottom:20, textAlign:"center" }}>
          {stage.label} — Question {blockQ + 1} of 3
        </div>

        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontFamily:PX, fontSize:32, color:"#ffd700", marginBottom:20, letterSpacing:2, lineHeight:1.6 }}>
            {q.a} {q.op} {q.b} = ?
          </div>
          <input ref={inputRef} type="number" inputMode="numeric" value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key==="Enter" && answer!=="" && !feedback && submit()}
            style={{ border:`3px solid ${feedback==="correct"?"#22c55e":"#ffd700"}`, padding:"12px 16px", fontSize:28, fontFamily:"monospace", width:140, textAlign:"center", background:feedback==="correct"?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.1)", color:"#fff", transition:"all 0.2s", outline:"none" }}
            disabled={!!feedback} />
          {feedback==="correct" && (
            <div style={{ marginTop:12, fontWeight:900, fontSize:15, color:"#22c55e" }}>
              ✓ Correct!
            </div>
          )}
        </div>

        <button onClick={submit} disabled={answer===""||!!feedback}
          style={{ width:"100%", border:"4px solid #ffd700", background:answer===""||feedback?"rgba(255,255,255,0.1)":"#ffd700", color:answer===""||feedback?"#9ca3af":"#111", fontFamily:PX, fontSize:10, padding:"14px", cursor:answer===""||feedback?"not-allowed":"pointer", boxShadow:answer===""||feedback?"none":"5px 5px 0 #b8860b", lineHeight:1.8 }}>
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
  // staySignedIn: default true for existing users (backwards compat), explicit false = show landing
  const staySignedIn = s?.staySignedIn !== false;
  // Determine initial phase
  const hasExistingProfile = (syncPin && profiles[activeProfileId]) || (!syncPin && activeProfileId && profiles[activeProfileId]);
  let initialPhase = (hasExistingProfile && staySignedIn) ? PHASE.WELCOME : PHASE.LANDING;
  if (staySignedIn && syncPin && profiles[activeProfileId]?.placementDone) initialPhase = PHASE.APP;
  else if (staySignedIn && syncPin && profiles[activeProfileId]) initialPhase = PHASE.PLACEMENT;
  else if (staySignedIn && !syncPin && activeProfileId && profiles[activeProfileId]?.placementDone) initialPhase = PHASE.APP;
  return { profiles, activeProfileId, appSettings, syncPin, staySignedIn, initialPhase };
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

function CelebrationOverlay({ show, onDismiss, encouragement, newBadges, character }) {
  if (!show) return null;
  const colors = ["#f59e0b","#ef4444","#3b82f6","#22c55e","#a855f7","#ec4899","#06b6d4"];
  const pieces = Array.from({ length: 28 }, (_, i) => ({ left:`${3+(i*3.4)%93}%`, color:colors[i%colors.length], delay:`${(i*0.09).toFixed(2)}s`, size:8+(i%5)*4 }));
  return (
    <div onClick={onDismiss} style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",cursor:"pointer" }}>
      {pieces.map((p,i) => <div key={i} style={{ position:"absolute",top:"-60px",left:p.left,width:p.size,height:p.size,background:p.color,borderRadius:i%2===0?"50%":2,animation:`confetti-fall 2.6s ease-in ${p.delay} both` }} />)}
      <div style={{ background:"#fff",border:"4px solid #111",boxShadow:"8px 8px 0 #111",padding:"36px 44px",textAlign:"center",maxWidth:420,animation:"celebrate-pulse 0.8s ease-in-out infinite" }}>
        {encouragement?.type === "mastery" && (
          <img src={`/char-${character||"mage"}.png`} alt="Your hero" style={{ imageRendering:"pixelated", width:100, height:"auto", marginBottom:8 }} />
        )}
        <div style={{ fontSize:52, marginBottom:8 }}>{encouragement?.emoji || "🌟"}</div>
        <div style={{ fontSize:28,fontWeight:900,color:"#111",fontFamily:"'Nunito',sans-serif",lineHeight:1.2 }}>{encouragement?.headline}</div>
        <div style={{ fontSize:15,color:"#374151",fontWeight:700,marginTop:10,lineHeight:1.5 }}>{encouragement?.body}</div>
        {encouragement?.type === "mastery" && <p style={{ fontSize:13, color:"#4f46e5", fontWeight:800, fontStyle:"italic", marginTop:8 }}>"The Maths Master approves."</p>}
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

// ── BadgeImg — shows image or colored fallback if missing ─────────────────────
function BadgeImg({ src, color, earned, size = 44 }) {
  const [err, setErr] = useState(false);
  if (!err && src) {
    return <img src={src} alt="" onError={() => setErr(true)}
      style={{ imageRendering:"pixelated", width:size, height:size, objectFit:"contain",
        opacity: earned ? 1 : 0.2, display:"block", flexShrink:0 }} />;
  }
  return (
    <div style={{ width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center",
      background: earned ? `${color}33` : "#0f0b1e", border:`2px solid ${earned ? color : "#3b2878"}`,
      flexShrink:0 }}>
      <span style={{ fontSize: size * 0.35, opacity: earned ? 1 : 0.25 }}>★</span>
    </div>
  );
}

// ── BadgeDetailModal ──────────────────────────────────────────────────────────
function BadgeDetailModal({ badge, earned, onClose }) {
  if (!badge) return null;
  const tier = TIER_INFO[badge.tier] || TIER_INFO[1];
  const PX = "'Press Start 2P', monospace";
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)", cursor:"pointer", padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#1a1035", border:`4px solid ${earned ? badge.color : "#3b2878"}`,
        boxShadow:`8px 8px 0 ${earned ? badge.color + "88" : "#06030f"}`, padding:32, maxWidth:360, width:"100%",
        textAlign:"center", cursor:"default" }}>
        {/* Badge image */}
        <div style={{ width:120, height:120, margin:"0 auto 16px", display:"flex", alignItems:"center", justifyContent:"center",
          background: earned ? `${badge.color}22` : "#0f0b1e", border:`3px solid ${earned ? badge.color : "#3b2878"}` }}>
          <BadgeImg src={badge.image} color={badge.color} earned={earned} size={96} />
        </div>
        {/* Tier label */}
        <div style={{ display:"inline-block", padding:"3px 12px", background:`${tier.color}22`, border:`2px solid ${tier.color}`,
          fontFamily:PX, fontSize:7, color:tier.color, lineHeight:1.8, marginBottom:10 }}>
          {tier.label}
        </div>
        {/* Name */}
        <div style={{ fontFamily:PX, fontSize:12, color: earned ? badge.color : "#4a3668", lineHeight:1.7, marginBottom:8 }}>
          {badge.label}
        </div>
        {/* Description */}
        <div style={{ fontSize:13, color:"#e2d4ff", fontWeight:700, lineHeight:1.6, marginBottom:16 }}>{badge.desc}</div>
        {/* Status */}
        {earned ? (
          <div style={{ padding:"8px 16px", background:`${badge.color}22`, border:`2px solid ${badge.color}`,
            fontFamily:PX, fontSize:8, color:badge.color, lineHeight:1.8 }}>✓ EARNED</div>
        ) : (
          <div style={{ padding:"8px 16px", background:"#0f0b1e", border:"2px solid #3b2878",
            fontSize:12, color:"#9b80d4", fontWeight:700, fontStyle:"italic" }}>Not yet earned</div>
        )}
        <div style={{ marginTop:16, fontSize:11, color:"#4a3668", fontWeight:700 }}>Tap anywhere to close</div>
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
  const [staySignedIn, setStaySignedIn] = useState(loaded.staySignedIn);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [practiceId, setPracticeId] = useState(null); // null = active level
  // PIN entry screen state
  const [pinLoading, setPinLoading] = useState(false);
  const [pinLoadError, setPinLoadError] = useState("");

  // Worksheet state
  const [answers, setAnswers] = useState({});
  const [lockedAnswers, setLockedAnswers] = useState(new Set()); // indices locked after first entry
  const [currentPage, setCurrentPage] = useState(0); // 0, 1, 2
  const [hints, setHints] = useState({}); // { [i]: { loading: bool, text: string|null } }
  // AI features
  const [levelIntros, setLevelIntros] = useState({});
  const [mistakeInsight, setMistakeInsight] = useState(null);
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [dailyAnswer, setDailyAnswer] = useState("");
  const [customPackTopic, setCustomPackTopic] = useState("");
  const [customPackLoading, setCustomPackLoading] = useState(false);
  const [customProblems, setCustomProblems] = useState(null); // array when active, null = use normal
  const [customPackLabel, setCustomPackLabel] = useState("");
  const [progressQuery, setProgressQuery] = useState("");
  const [progressResponse, setProgressResponse] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [goalDeadlineInput, setGoalDeadlineInput] = useState("");
  const [goalAssessment, setGoalAssessment] = useState(null);
  const [goalLoading, setGoalLoading] = useState(false);
  const [showLevelDetails, setShowLevelDetails] = useState(false);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [coinPop, setCoinPop] = useState(null); // index of card that just earned a coin
  const [mascotState, setMascotState] = useState("focus"); // focus | happy | celebrate
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [questionTimings, setQuestionTimings] = useState({});
  const inputRefs = useRef([]);
  const questionStartTimesRef = useRef({});

  // Badge detail modal
  const [selectedBadge, setSelectedBadge] = useState(null);

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
  const parentTierUnlocked = !!appSettings.parentTierUnlocked;
  function unlockParentTier(email) {
    setAppSettings(s => ({ ...s, parentTierUnlocked: true, parentTierEmail: email }));
    setShowUpgradeModal(false);
  }

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

  const generatedProblems = useMemo(() => buildProblems(currentLevelId, masteredIds, isSpeedPhase), [currentLevelId, masteredIds, isSpeedPhase]);
  const problems = customProblems !== null ? customProblems : generatedProblems;

  useEffect(() => { safeWrite({ profiles, activeProfileId, appSettings, syncPin, staySignedIn }); }, [profiles, activeProfileId, appSettings, syncPin, staySignedIn]);


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

  // Level intro — fetch once per level
  useEffect(() => {
    if (!currentLevelId || levelIntros[currentLevelId]) return;
    setLevelIntros(prev => ({ ...prev, [currentLevelId]: "loading" }));
    fetch("/.netlify/functions/level-intro", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelTitle: currentLevel.title, sectionName: currentLevel.sectionName, skill: currentLevel.skill }),
    }).then(r => r.json()).then(d => {
      setLevelIntros(prev => ({ ...prev, [currentLevelId]: stripMarkdown(d.intro || "") }));
    }).catch(() => setLevelIntros(prev => ({ ...prev, [currentLevelId]: "" })));
  }, [currentLevelId]); // eslint-disable-line

  // Daily challenge — load once per day per profile
  useEffect(() => {
    if (!activeProfileId || !currentLevel) return;
    const key = `daily-challenge-v2-${activeProfileId}-${todayDate}`;
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached) { setDailyChallenge(cached); return; }
    fetch("/.netlify/functions/daily-challenge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelTitle: currentLevel.title, sectionName: currentLevel.sectionName, skill: currentLevel.skill }),
    }).then(r => r.json()).then(d => {
      if (d.a != null) {
        const challenge = { ...d, completed: false, date: todayDate };
        setDailyChallenge(challenge);
        localStorage.setItem(key, JSON.stringify(challenge));
      }
    }).catch(() => {});
  }, [activeProfileId, todayDate]); // eslint-disable-line

  // Sync goal inputs when profile changes
  useEffect(() => {
    setGoalInput(profile.goal || "");
    setGoalDeadlineInput(profile.goalDeadline || "");
  }, [activeProfileId]); // eslint-disable-line

  useEffect(() => {
    if (done) return;
    if (hasAny && !running) setRunning(true);
  }, [hasAny, running, done]);

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

  function handleSignup({ name, age, pin, character }) {
    const id = pin;
    const newProfile = { ...EMPTY_PROFILE(id, name), age, character: character || "mage" };
    setProfiles(prev => ({ ...prev, [id]: newProfile }));
    setActiveProfileId(id);
    setSyncPin(pin);
    setStaySignedIn(true);
    setAppPhase(PHASE.PLACEMENT);
  }

  async function handlePinEntry(pin, keepSignedIn = true) {
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
        setStaySignedIn(keepSignedIn);
        const profile = (data.profiles || {})[data.activeProfileId || pin];
        setAppPhase(profile?.placementDone ? PHASE.APP : PHASE.PLACEMENT);
      } else {
        // No cloud data — create fresh profile with this PIN
        const id = pin;
        const newProfile = EMPTY_PROFILE(id, "My Account");
        setProfiles(prev => ({ ...prev, [id]: newProfile }));
        setActiveProfileId(id);
        setSyncPin(pin);
        setStaySignedIn(keepSignedIn);
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
    if (el) { el.focus({ preventScroll: true }); el.select?.(); }
  }

  function startSession() {
    setAnswers({});
    setLockedAnswers(new Set());
    setCurrentPage(0);
    setQuestionTimings({});
    questionStartTimesRef.current = {};
    setTime(0);
    setDone(false);
    setRunning(false);
    setShowCelebration(false);
    setLastResult(null);
    setHints({});
    setDailyAnswer("");
    setSessionCoins(0);
    setCoinPop(null);
    setMascotState("focus");
    setTimeout(() => focusQuestion(0), 0);
  }

  function lockAnswer(i) {
    setLockedAnswers(prev => new Set([...prev, i]));
    // Award coin if correct
    const val = answers[i] || "";
    const p = problems[i];
    if (p && val !== "" && normalizeAnswer(val) === normalizeAnswer(p.answer)) {
      setSessionCoins(c => c + 1);
      setCoinPop(i);
      setMascotState("celebrate");
      setTimeout(() => { setCoinPop(null); setMascotState("happy"); }, 600);
      setTimeout(() => setMascotState("focus"), 2000);
    }
  }

  function loadCustomPack(questions, label) {
    setCustomProblems(questions);
    setCustomPackLabel(label);
    startSession();
    setActiveTab("dashboard");
  }

  function exitCustomPack() {
    setCustomProblems(null);
    setCustomPackLabel("");
    startSession();
  }

  function completeDailyChallenge() {
    const key = `daily-challenge-v2-${activeProfileId}-${todayDate}`;
    const updated = { ...dailyChallenge, completed: true };
    setDailyChallenge(updated);
    localStorage.setItem(key, JSON.stringify(updated));
    setDailyAnswer("");
  }

  async function fetchMistakeInsight() {
    if (!history || history.length < 5) return;
    try {
      const res = await fetch("/.netlify/functions/analyze-mistakes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(0, 10), name: profile.name }),
      });
      const data = await res.json();
      if (data.insight) setMistakeInsight(data.insight);
    } catch {}
  }

  async function generateCustomPack() {
    if (!customPackTopic.trim()) return;
    setCustomPackLoading(true);
    try {
      const res = await fetch("/.netlify/functions/custom-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: customPackTopic.trim(), count: 36 }),
      });
      const data = await res.json();
      if (data.questions?.length > 0) {
        loadCustomPack(data.questions, customPackTopic.trim());
        setCustomPackTopic("");
      }
    } catch {}
    setCustomPackLoading(false);
  }

  async function askProgressQuestion() {
    if (!progressQuery.trim()) return;
    setProgressLoading(true);
    try {
      const res = await fetch("/.netlify/functions/progress-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: progressQuery.trim(),
          name: profile.name,
          history, streak, masteredCount,
          totalLevels: flatLevels.length,
          currentLevel: currentLevel.title,
        }),
      });
      const data = await res.json();
      setProgressResponse(data.response || "");
    } catch { setProgressResponse("Sorry, couldn't get a response."); }
    setProgressLoading(false);
  }

  async function processHomework(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHomeworkLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const mediaType = file.type || "image/jpeg";
        const res = await fetch("/.netlify/functions/homework-helper", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType }),
        });
        const data = await res.json();
        if (data.questions?.length > 0) {
          loadCustomPack(data.questions, "Homework");
        }
        setHomeworkLoading(false);
      };
      reader.readAsDataURL(file);
    } catch { setHomeworkLoading(false); }
  }

  async function checkGoalProgress() {
    if (!goalInput.trim()) return;
    setGoalLoading(true);
    try {
      const res = await fetch("/.netlify/functions/goal-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name, goal: goalInput, deadline: goalDeadlineInput,
          masteredCount, totalLevels: flatLevels.length,
          currentLevel: currentLevel.title, history, streak,
        }),
      });
      const data = await res.json();
      setGoalAssessment(data.assessment || "");
    } catch { setGoalAssessment("Could not check progress. Please try again."); }
    setGoalLoading(false);
  }

  async function fetchHint(i, p, userAnswer) {
    setHints(prev => ({ ...prev, [i]: { loading: true, text: null } }));
    try {
      const res = await fetch("/.netlify/functions/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `${p.a} ${p.op} ${p.b}`,
          wrongAnswer: userAnswer,
          correctAnswer: p.answer,
        }),
      });
      const data = await res.json();
      setHints(prev => ({ ...prev, [i]: { loading: false, text: data.hint || "Keep trying! 💪" } }));
    } catch {
      setHints(prev => ({ ...prev, [i]: { loading: false, text: "Keep trying — you can do it! 💪" } }));
    }
  }

  function submitCurrentPage() {
    // Lock all questions on current page (unanswered ones become blank = wrong)
    const pageStart = currentPage * PAGE_SIZE;
    setLockedAnswers(prev => {
      const next = new Set(prev);
      for (let j = 0; j < PAGE_SIZE; j++) next.add(pageStart + j);
      return next;
    });
  }

  function advancePage() {
    const totalPages = Math.ceil(QUESTIONS_PER_SHEET / PAGE_SIZE);
    if (currentPage < totalPages - 1) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      setTimeout(() => focusQuestion(nextPage * PAGE_SIZE), 50);
    } else {
      finishSession();
    }
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

    // Badges — extra tracking vars
    const isPerfectSpeed = isSpeedPhase && accuracy === 100;
    const newConsecutivePerfects = isPerfectSpeed ? (profile.consecutivePerfects || 0) + 1 : 0;
    const newPerfectSheets = (profile.perfectSheets || 0) + (isPerfectSpeed ? 1 : 0);
    const newHighAccuracySessions = (profile.highAccuracySessions || 0) + (accuracy >= ACCURACY_THRESHOLD ? 1 : 0);
    const currentHour = new Date().getHours();
    const daysSinceLastPractice = lastCompletedDate
      ? Math.floor((Date.now() - new Date(lastCompletedDate)) / 86400000) : 0;
    const newBadges = computeNewBadges(
      { badges, perfectSheets: newPerfectSheets },
      { accuracy, isSpeedPhase, newSpeedPasses, newMasteredCount, newTotalQ, newStreak,
        isBestTime, levelProgress: newLevelProgress, time, masteryTime: currentLevel.masteryTime,
        currentHour, newConsecutivePerfects, daysSinceLastPractice, newHighAccuracySessions,
        justMasteredLevelId: justMastered ? currentLevelId : null }
    );

    // Timings
    const timings = Object.entries(questionTimings).map(([idx, ms]) => {
      const p = problems[Number(idx)];
      return { ms, label: `${p?.a} ${p?.op} ${p?.b}` };
    }).sort((a, b) => b.ms - a.ms);
    const avgMs = timings.length ? Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length) : 0;

    // Track wrong questions for mistake analysis
    const wrongQuestions = problems.map((p, i) => {
      const val = answers[i] || "";
      return val !== "" && normalizeAnswer(val) !== normalizeAnswer(p.answer) ? `${p.a} ${p.op} ${p.b}` : null;
    }).filter(Boolean).slice(0, 10);

    updateProfile({
      totalQuestions: newTotalQ,
      streak: newStreak,
      bestStreak: Math.max(bestStreak, newStreak),
      lastCompletedDate: todayDate,
      levelProgress: customProblems ? levelProgress : newLevelProgress, // don't advance level on custom packs
      badges: [...badges, ...newBadges],
      history: [{
        id: `${Date.now()}`,
        date: todayDate,
        levelTitle: customProblems ? `Custom: ${customPackLabel}` : currentLevel.title,
        sectionName: customProblems ? "Custom Pack" : currentLevel.sectionName,
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
        wrong: wrongQuestions,
      }, ...history].slice(0, 60),
    });
    setTimeout(() => fetchMistakeInsight(), 1000);

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
  // Dark fantasy RPG palette
  const C = {
    bg:"#0d0a1a", bgCard:"#1a1035", bgFlat:"#130d26", bgAlt:"#0f0b1e",
    border:"#3b2878", borderHi:"#7c3aed", shadow:"#06030f",
    text:"#e2d4ff", textSub:"#9b80d4", textDim:"#4a3668",
    gold:"#fbbf24", goldDim:"#92670f",
    green:"#34d399", greenBg:"#042819",
    red:"#f87171", redBg:"#2d0a0a",
    purple:"#c4b5fd", purpleMid:"#7c3aed",
  };
  const BD = `4px solid ${C.border}`;
  const SD = `5px 5px 0 ${C.shadow}`;

  const S = {
    page: { minHeight:"100vh", background:C.bg, fontFamily:"'Nunito',sans-serif", color:C.text, padding:16, boxSizing:"border-box" },
    wrap: { maxWidth:1100, margin:"0 auto" },
    card: { background:C.bgCard, border:BD, boxShadow:SD, padding:20, marginBottom:16 },
    flat: { background:C.bgFlat, border:`2px solid ${C.border}`, padding:14, marginBottom:10 },
    h: (sz=16) => ({ fontFamily:PX, fontSize:sz, lineHeight:1.7, margin:0, color:C.gold }),
    sub: { fontSize:13, color:C.textSub, fontWeight:700, lineHeight:1.5, margin:0 },
    tab: (a) => ({ border:`4px solid ${a?C.gold:C.border}`, padding:"10px 16px", cursor:"pointer", fontFamily:PX, fontSize:9, lineHeight:1.8, background:a?C.bgCard:C.bgAlt, color:a?C.gold:C.textDim, boxShadow:a?`5px 5px 0 ${C.shadow}`:SD }),
    btn: (bg=C.purpleMid, sh=C.shadow) => ({ border:BD, padding:"12px 20px", background:bg, color: bg===C.gold||bg==="#fbbf24"?"#111":"#fff", fontFamily:PX, fontSize:10, lineHeight:1.8, boxShadow:`5px 5px 0 ${sh}`, cursor:"pointer" }),
    qCard: (cor, wr, lv) => ({ background:cor||lv?C.greenBg:wr?C.redBg:C.bgAlt, border:`3px solid ${cor||lv?C.green:wr?C.red:C.border}`, boxShadow:`3px 3px 0 ${cor||lv?"#042819":wr?"#2d0a0a":C.shadow}`, padding:"8px 6px", minHeight:80, position:"relative" }),
    inp: (lv,cor,wr) => ({ width:"100%", maxWidth:56, height:38, border:`3px solid ${lv||cor?C.green:wr?C.red:C.purpleMid}`, textAlign:"center", fontSize:17, fontWeight:900, marginLeft:3, background:lv||cor?C.greenBg:wr?C.redBg:"#231760", outline:"none", fontFamily:"'Nunito',sans-serif", color:lv||cor?C.green:wr?C.red:C.text, boxShadow:`2px 2px 0 ${lv||cor?"#042819":wr?"#2d0a0a":C.shadow}`, boxSizing:"border-box" }),
    settingInp: { height:44, border:BD, padding:"0 12px", fontSize:15, fontWeight:700, background:C.bgFlat, outline:"none", boxSizing:"border-box", fontFamily:"'Nunito',sans-serif", boxShadow:`3px 3px 0 ${C.shadow}`, color:C.text },
  };

  // Timer color logic (only shown in speed phase)
  const timerColor = time === 0 ? C.textDim : time <= currentLevel.masteryTime ? C.green : time <= currentLevel.masteryTime * 1.25 ? C.gold : C.red;

  const stateLabel = { [LS.LOCKED]:"🔒 Locked", [LS.ACCURACY]:"⚡ Accuracy Phase", [LS.SPEED]:"★ Speed Phase", [LS.MASTERED]:"✨ Mastered" };
  const stateColor = { [LS.LOCKED]:C.textDim, [LS.ACCURACY]:C.purple, [LS.SPEED]:C.gold, [LS.MASTERED]:C.green };

  // ── Phase routing ────────────────────────────────────────────────────────────
  if (appPhase === PHASE.LANDING) return <LandingPage onStart={() => setAppPhase(PHASE.SIGNUP)} onReturn={() => setAppPhase(PHASE.PIN_ENTRY)} />;
  if (appPhase === PHASE.WELCOME) return <WelcomeScreen onNew={() => setAppPhase(PHASE.SIGNUP)} onReturn={() => setAppPhase(PHASE.PIN_ENTRY)} />;
  if (appPhase === PHASE.SIGNUP) return <SignupScreen onComplete={handleSignup} onBack={() => setAppPhase(PHASE.WELCOME)} />;
  if (appPhase === PHASE.PIN_ENTRY) return <PinEntryScreen onSubmit={handlePinEntry} onBack={() => setAppPhase(PHASE.WELCOME)} loading={pinLoading} error={pinLoadError} />;
  if (appPhase === PHASE.PLACEMENT) {
    const prof = profiles[activeProfileId] || {};
    const startStage = ageToStartStage(prof.age || 8);
    return <PlacementTest profileName={prof.name || "there"} startStage={startStage} onComplete={completePlacement} onParentOverride={skipPlacement} parentPin={appSettings.parentPin} character={prof.character} />;
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* ── Header ── */}
        <div style={{ background:"linear-gradient(150deg, #1e1350 0%, #0f0a1e 100%)", border:`4px solid ${C.gold}`, boxShadow:`0 0 32px rgba(251,191,36,0.18), 5px 5px 0 ${C.shadow}`, marginBottom:14, overflow:"hidden" }}>
          {/* Top gold accent stripe */}
          <div style={{ height:3, background:`linear-gradient(90deg, transparent, ${C.gold}, ${C.purple}, ${C.gold}, transparent)` }} />

          <div style={{ padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, flexWrap:"wrap" }}>

              {/* Logo + Title */}
              <div style={{ display:"flex", alignItems:"center", gap:18 }}>
                {/* Crest logo */}
                <div style={{ position:"relative", flexShrink:0 }}>
                  <img src="/logo-crest.png" alt="Get Maths Mastery"
                    style={{ imageRendering:"pixelated", width:80, height:80, objectFit:"contain", display:"block",
                      filter:"drop-shadow(0 0 16px rgba(251,191,36,0.6)) drop-shadow(0 0 6px rgba(196,181,253,0.4))" }} />
                </div>
                <div>
                  {/* Main title */}
                  <div style={{ fontFamily:PX, margin:0 }}>
                    <div style={{ fontSize:9, color:C.gold, letterSpacing:"0.18em", marginBottom:4, opacity:0.7 }}>
                      ★ GET ★
                    </div>
                    <div style={{ lineHeight:1.2 }}>
                      <span style={{ fontSize:20, color:C.gold, letterSpacing:"0.05em", display:"block" }} className="title-glow flicker">
                        MATHS
                      </span>
                      <span style={{ fontSize:20, color:C.purple, letterSpacing:"0.05em", display:"block",
                        textShadow:`0 0 20px ${C.purple}66` }}>
                        MASTERY
                      </span>
                    </div>
                  </div>
                  {/* Welcome sub-line */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8 }}>
                    <div style={{ height:1, width:28, background:`linear-gradient(90deg, transparent, ${C.gold})` }} />
                    <span style={{ fontSize:11, color:C.textSub, fontWeight:700 }}>
                      Welcome back, <span style={{ color:C.purple }}>{profile.name}</span>
                    </span>
                    <div style={{ height:1, width:28, background:`linear-gradient(90deg, ${C.gold}, transparent)` }} />
                  </div>
                </div>
              </div>

              <button onClick={() => { setStaySignedIn(false); setAppPhase(PHASE.LANDING); }} className="fun-btn"
                style={{ border:`2px solid ${C.border}`, padding:"9px 14px", cursor:"pointer", fontFamily:PX, fontSize:8, lineHeight:1.8, background:C.bgAlt, color:C.textSub, boxShadow:SD, alignSelf:"flex-start", flexShrink:0 }}>
                Sign Out
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:8, marginTop:16 }}>
              {[
                { label:"Questions", value:totalQuestions.toLocaleString(), color:C.gold,    icon:"/icon-questions.png" },
                { label:"Mastered",  value:`${masteredCount}/${flatLevels.length}`,  color:C.green,   icon:"/icon-mastered.png" },
                { label:"Progress",  value:`${overallPct}%`,                         color:C.purple,  icon:"/icon-progress.png" },
                { label:"Streak",    value:`${streak} day${streak!==1?"s":""}`,      color:"#f472b6", icon:"/icon-streak.png" },
                { label:"Badges",    value:`${badges.length}/${ALL_BADGE_DEFS.length}`, color:C.gold, icon:"/icon-badges.png" },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{ background:"rgba(255,255,255,0.04)", border:`2px solid ${C.border}`, padding:"10px 12px", position:"relative", overflow:"hidden" }}>
                  <img src={icon} alt="" style={{ position:"absolute", top:6, right:8, width:24, height:24, imageRendering:"pixelated", opacity:0.5 }} />
                  <div style={{ fontSize:9, color:C.textDim, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                  <div style={{ fontSize:18, fontWeight:900, color, marginTop:3 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom accent stripe */}
          <div style={{ height:2, background:`linear-gradient(90deg, transparent, ${C.border}, transparent)` }} />
        </div>

        {/* ── Sync status bar ── */}
        {syncPin && syncStatus && (
          <div style={{ background:syncStatus==="saved"?C.greenBg:syncStatus==="error"?C.redBg:C.bgFlat, border:`2px solid ${syncStatus==="saved"?C.green:syncStatus==="error"?C.red:C.gold}`, padding:"8px 14px", marginBottom:10, fontWeight:700, fontSize:12, display:"flex", alignItems:"center", gap:8, color:syncStatus==="saved"?C.green:syncStatus==="error"?C.red:C.gold }}>
            <span>{syncStatus==="saved"?"✓ Progress saved to cloud":syncStatus==="error"?"✗ Sync error — check connection":"↑ Syncing…"}</span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
          {[
            ["dashboard","Quest",    "/tab-quest.png"],
            ["journey",  "Journey",  "/tab-journey.png"],
            ["badges",   "Trophies", "/tab-trophies.png"],
            ["history",  "History",  "/tab-history.png"],
            ["settings", "Settings", "/tab-settings.png"],
          ].map(([id, label, icon]) => (
            <button key={id} onClick={() => setActiveTab(id)} className="fun-btn"
              style={{ ...S.tab(activeTab===id), display:"flex", alignItems:"center", gap:6 }}>
              <img src={icon} alt="" style={{ width:16, height:16, imageRendering:"pixelated", flexShrink:0 }} />
              {label}
            </button>
          ))}
        </div>

        {/* ═══════════════ DASHBOARD ═══════════════ */}
        {activeTab === "dashboard" && (
          <>
            <CelebrationOverlay show={showCelebration} onDismiss={() => { setShowCelebration(false); setActiveTab("dashboard"); }}
              encouragement={lastResult?.encouragement} newBadges={lastResult?.newBadges} character={profile.character} />
            <BadgeDetailModal badge={selectedBadge} earned={selectedBadge ? badges.includes(selectedBadge.id) : false} onClose={() => setSelectedBadge(null)} />
            {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} onUnlocked={unlockParentTier} paymentLink={STRIPE_PAYMENT_LINK} />}

            {/* Current level info card — collapsed by default */}
            <div style={{ ...S.card, borderLeft:`6px solid ${stateColor[levelState]}`, boxShadow:`-4px 0 16px ${stateColor[levelState]}44, 5px 5px 0 ${C.shadow}`, padding:0, overflow:"hidden" }}>
              {/* Always-visible header row */}
              <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", padding:"14px 16px", cursor:"pointer" }}
                onClick={() => setShowLevelDetails(v => !v)}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:8, color:C.textDim, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:3 }}>{currentLevel.sectionName}</div>
                  <div style={{ fontFamily:PX, fontSize:12, color:C.gold, lineHeight:1.6, margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentLevel.title}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                  <span style={{ display:"inline-block", padding:"3px 10px", background:stateColor[levelState]+"22", border:`2px solid ${stateColor[levelState]}`, fontFamily:PX, fontSize:7, lineHeight:1.8, color:stateColor[levelState] }}>
                    {stateLabel[levelState]}
                  </span>
                  {isSpeedPhase && <PhaseIndicator passes={currentProg.speedPasses || 0} />}
                  {isSpeedPhase && (
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:9, color:C.textSub, fontWeight:700 }}>Target</div>
                      <div style={{ fontSize:15, fontWeight:900, color:C.purple, fontFamily:PX }}>{formatTime(currentLevel.masteryTime)}</div>
                    </div>
                  )}
                  <div style={{ fontSize:16, color:C.textDim, transition:"transform 0.2s", transform:showLevelDetails?"rotate(180deg)":"rotate(0deg)" }}>▼</div>
                </div>
              </div>

              {/* Custom pack indicator — always visible when active */}
              {customProblems && (
                <div style={{ margin:"0 16px 12px", padding:"8px 12px", background:C.bgFlat, border:`2px solid ${C.gold}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.gold }}>📦 Custom Pack: {customPackLabel}</span>
                  <button onClick={exitCustomPack} className="fun-btn" style={{ fontSize:10, padding:"3px 8px", background:C.bgAlt, border:`1.5px solid ${C.gold}`, cursor:"pointer", fontWeight:700, color:C.gold }}>✕ Exit</button>
                </div>
              )}

              {/* Expandable details */}
              {showLevelDetails && (
                <div style={{ borderTop:`2px solid ${C.border}`, padding:"14px 16px" }}>
                  <div style={{ ...S.sub, marginBottom:10 }}>{currentLevel.skill}</div>

                  {isSpeedPhase && currentProg.bestTime != null && (
                    <div style={{ fontSize:12, color:C.green, fontWeight:800, marginBottom:10 }}>Your best: {formatTime(currentProg.bestTime)}</div>
                  )}
                  {levelState === LS.MASTERED && <div style={{ fontSize:13, fontWeight:800, color:C.green, marginBottom:10 }}>✓ Mastered! Keep practising to stay sharp.</div>}

                  {isAccuracyPhase && (
                    <div style={{ padding:"10px 14px", background:C.bgFlat, border:`2px solid ${C.borderHi}`, marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:C.purple }}>💡 <em>{currentLevel.sectionTip}</em></span>
                    </div>
                  )}

                  {levelIntros[currentLevelId] && levelIntros[currentLevelId] !== "loading" && !customProblems && (
                    <div style={{ padding:"12px 16px", background:C.bgFlat, border:`2px solid ${C.green}40`, fontSize:15, fontWeight:800, color:C.green, lineHeight:1.6, marginBottom:8 }}>
                      🧙 {levelIntros[currentLevelId]}
                    </div>
                  )}

                  <div style={{ padding:"8px 12px", background:C.bgFlat, border:`2px solid ${C.border}`, fontSize:11, fontWeight:700, color:C.textSub }}>
                    {isAccuracyPhase && `Phase 1 — Get ${ACCURACY_THRESHOLD}%+ correct to unlock Speed Phase`}
                    {isSpeedPhase && `Phase 2 — ${ACCURACY_THRESHOLD}%+ accuracy AND under ${formatTime(currentLevel.masteryTime)} · Need ${SPEED_PASSES_NEEDED} passes to master`}
                    {levelState === LS.MASTERED && "This level is mastered! Practising it here keeps your skills sharp."}
                    {levelState === LS.LOCKED && "Complete the previous level to unlock this one."}
                  </div>
                </div>
              )}
            </div>

            {/* Worksheet */}
            {(() => {
              const totalPages = Math.ceil(QUESTIONS_PER_SHEET / PAGE_SIZE);
              const pageStart = currentPage * PAGE_SIZE;
              const pageProblems = problems.slice(pageStart, pageStart + PAGE_SIZE);
              const pageAllLocked = pageProblems.every((_, j) => lockedAnswers.has(pageStart + j));
              const pageLocked = pageProblems.filter((_, j) => lockedAnswers.has(pageStart + j)).length;
              const pageCorrect = pageProblems.filter((p, j) => {
                const val = answers[pageStart + j] || "";
                return lockedAnswers.has(pageStart + j) && normalizeAnswer(val) === normalizeAnswer(p.answer);
              }).length;
              const questTarget = Math.round(PAGE_SIZE * ACCURACY_THRESHOLD / 100); // e.g. 11 of 12

              return (
                <div style={S.card}>

                  {/* ── Game HUD ── */}
                  <div style={{ marginBottom:14 }}>

                    {/* Row 1: Mascot + Coins + Timer + Pages + Restart */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
                      padding:"10px 14px", background:C.bgAlt, border:`2px solid ${C.border}`,
                      borderBottom:`2px solid ${C.border}60` }}>

                      {/* Mascot — bigger, outside coin box */}
                      <img src={`/char-${profile.character||"mage"}.png`} alt=""
                        className={`mascot-${mascotState}`}
                        style={{ imageRendering:"pixelated", width:56, height:56, objectFit:"contain", flexShrink:0,
                          filter:`drop-shadow(0 0 8px ${mascotState==="celebrate"?C.gold+"99":C.purple+"55"})` }} />

                      {/* Coin counter */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px",
                        background:C.bgCard, border:`2px solid ${C.gold}`,
                        boxShadow:`0 0 10px ${C.gold}33` }}>
                        <span style={{ fontSize:20, lineHeight:1 }}>🪙</span>
                        <div style={{ fontFamily:PX, fontSize:14, color:C.gold, lineHeight:1 }}>{sessionCoins}</div>
                      </div>

                      {/* Timer */}
                      {isSpeedPhase ? (
                        <div style={{ background:C.bgCard, color:timerColor, padding:"6px 14px", border:`3px solid ${timerColor}60`,
                          fontFamily:PX, fontSize:14, lineHeight:1.3, minWidth:80, textAlign:"center",
                          boxShadow:`0 0 12px ${timerColor}30` }}>
                          {formatTime(time)}
                          {time > 0 && <div style={{ fontSize:8, color:timerColor, marginTop:2 }}>
                            {time <= currentLevel.masteryTime ? `${currentLevel.masteryTime-time}s left` : `${time-currentLevel.masteryTime}s over`}
                          </div>}
                        </div>
                      ) : (
                        <div style={{ padding:"6px 12px", background:C.bgCard, border:`2px solid ${C.border}`,
                          fontFamily:PX, fontSize:8, color:C.textDim, lineHeight:1.8 }}>
                          Accuracy<br/>Mode
                        </div>
                      )}

                      {/* Spacer */}
                      <div style={{ flex:1 }} />

                      {/* Page tabs */}
                      <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                        <span style={{ fontSize:10, color:C.textDim, fontWeight:700, marginRight:2 }}>Page</span>
                        {Array.from({ length: totalPages }, (_, pg) => (
                          <div key={pg} style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center",
                            fontFamily:PX, fontSize:8, lineHeight:1,
                            background: pg < currentPage ? C.greenBg : pg === currentPage ? C.bgCard : C.bgAlt,
                            color: pg < currentPage ? C.green : pg === currentPage ? C.gold : C.textDim,
                            border: `2px solid ${pg < currentPage ? C.green : pg === currentPage ? C.gold : C.border}` }}>
                            {pg < currentPage ? "✓" : pg+1}
                          </div>
                        ))}
                        <button onClick={startSession} className="fun-btn"
                          style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center",
                            border:`2px solid ${C.border}`, cursor:"pointer",
                            fontFamily:"'Nunito',sans-serif", fontSize:16, background:C.bgAlt, color:C.textDim, boxShadow:SD, padding:0 }}>↺</button>
                      </div>
                    </div>

                    {/* Row 2: Quest progress bar */}
                    <div style={{ padding:"8px 14px", background:`${C.bgAlt}cc`, border:`2px solid ${C.border}`,
                      borderTop:"none" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:C.textSub }}>
                          ★ Quest — get <span style={{ color:C.gold }}>{questTarget}</span> correct to complete
                        </span>
                        <span style={{ fontFamily:PX, fontSize:9,
                          color: pageCorrect >= questTarget ? C.green : pageCorrect > 0 ? C.gold : C.textDim }}>
                          {pageCorrect >= questTarget ? "✓ Done!" : `${pageCorrect}/${questTarget}`}
                        </span>
                      </div>
                      <div style={{ height:14, background:C.bgFlat, border:`2px solid ${C.border}`, overflow:"hidden", position:"relative" }}>
                        <div style={{ width:`${Math.min((pageCorrect/questTarget)*100,100)}%`, height:"100%",
                          background: pageCorrect >= questTarget
                            ? `linear-gradient(90deg, ${C.green}, #6ee7b7)`
                            : `linear-gradient(90deg, ${C.gold}, #fde68a)`,
                          transition:"width 0.4s ease",
                          boxShadow: pageCorrect >= questTarget ? `0 0 10px ${C.green}88` : `0 0 6px ${C.gold}66` }} />
                        {/* Tick marks */}
                        {Array.from({length: questTarget}, (_,t) => (
                          <div key={t} style={{ position:"absolute", left:`${((t+1)/questTarget)*100}%`,
                            top:0, bottom:0, width:1, background:`${C.border}88` }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Per-page live accuracy bar (shows after first answer) */}
                  {pageLocked > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, fontWeight:700, marginBottom:3, color:C.textSub }}>
                        <span>{pageCorrect} correct · {pageLocked} answered</span>
                        <span style={{ color: (pageCorrect/pageLocked)*100 >= ACCURACY_THRESHOLD ? C.green : (pageCorrect/pageLocked)*100 >= 80 ? C.gold : C.red, fontFamily:PX, fontSize:9 }}>
                          {Math.round((pageCorrect/pageLocked)*100)}%
                        </span>
                      </div>
                      <div style={{ width:"100%", height:8, background:C.bgAlt, border:`2px solid ${C.border}`, overflow:"hidden" }}>
                        <div style={{ width:`${(pageCorrect/pageLocked)*100}%`, height:"100%",
                          background: (pageCorrect/pageLocked)*100 >= ACCURACY_THRESHOLD ? C.green : (pageCorrect/pageLocked)*100 >= 80 ? C.gold : C.red,
                          transition:"width 0.25s" }} />
                      </div>
                    </div>
                  )}

                  {/* Review notice */}
                  {isSpeedPhase && masteredIds.length >= 1 && pageProblems.some(p => p.isReview) && (
                    <div style={{ marginBottom:10, fontSize:11, color:C.textSub, fontWeight:700, padding:"5px 10px",
                      background:C.bgFlat, border:`2px solid ${C.border}` }}>
                      ♻️ Includes review questions from previous levels.
                    </div>
                  )}

                  {/* Question grid — 6 columns = 2 clean rows, equal height */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gridAutoRows:"1fr", gap:8 }}>
                    {pageProblems.map((p, j) => {
                      const i = pageStart + j;
                      const val = answers[i] || "";
                      const locked = lockedAnswers.has(i) || done;
                      const correct = locked && normalizeAnswer(val) === normalizeAnswer(p.answer);
                      const wrong = locked && !correct;
                      const live = !locked && val !== "" && normalizeAnswer(val) === normalizeAnswer(p.answer);
                      const justEarned = coinPop === i;
                      return (
                        <div key={`${currentLevelId}-${i}`}
                          className={correct||live?"correct-card":""}
                          style={{ ...S.qCard(correct,wrong,live),
                            outline: p.isReview ? `2px dashed ${C.purple}` : "none",
                            transform: justEarned ? "scale(1.04)" : "scale(1)",
                            transition:"transform 0.15s" }}>

                          {/* Q number */}
                          <div style={{ fontSize:8, color:C.textSub, fontFamily:PX, marginBottom:4, lineHeight:1.4 }}>Q{i+1}</div>

                          {/* Equation + input */}
                          <div style={{ fontSize:14, fontWeight:900, display:"flex", alignItems:"center", gap:3 }}>
                            <span style={{ color:C.text, whiteSpace:"nowrap" }}>{p.a} {p.op} {p.b} =</span>
                            <input
                              ref={el => { inputRefs.current[i] = el; }}
                              value={val}
                              inputMode="decimal"
                              disabled={locked}
                              placeholder="?"
                              onFocus={() => markQuestionStart(i)}
                              onChange={e => {
                                if (locked) return;
                                const cleaned = e.target.value.replace(/[^0-9./-]/g, "");
                                setAnswers(prev => ({ ...prev, [i]: cleaned }));
                                captureQuestionTiming(i, cleaned);
                                if (normalizeAnswer(cleaned).length >= normalizeAnswer(p.answer).length && cleaned.length > 0) {
                                  lockAnswer(i);
                                  const pageEnd = pageStart + PAGE_SIZE - 1;
                                  if (i < pageEnd) setTimeout(() => focusQuestion(i + 1), 0);
                                }
                              }}
                              onKeyDown={e => {
                                if (locked) return;
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (val !== "") lockAnswer(i);
                                  const pageEnd = pageStart + PAGE_SIZE - 1;
                                  if (i < pageEnd) focusQuestion(i + 1);
                                }
                                if (e.key === "Backspace" && !val && i > pageStart) focusQuestion(i - 1);
                              }}
                              style={{ ...S.inp(live, correct, wrong), opacity: locked ? 0.85 : 1 }}
                            />
                          </div>

                          {/* Live correct pre-lock burst */}
                          {live && (
                            <div style={{ position:"absolute", top:3, right:5, animation:"emoji-pop 0.3s cubic-bezier(.34,1.56,.64,1) both", fontSize:14 }}>⚡</div>
                          )}

                          {/* Coin earn animation */}
                          {justEarned && (
                            <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)",
                              animation:"coin-rise 0.6s ease-out both", fontSize:16, pointerEvents:"none" }}>🪙</div>
                          )}

                          {/* Locked star */}
                          {locked && correct && (
                            <div style={{ position:"absolute", top:3, right:5, animation:"emoji-pop 0.4s cubic-bezier(.34,1.56,.64,1) both" }}>
                              <StarSVG size={16} color="#f59e0b" />
                            </div>
                          )}
                          {locked && wrong && val === "" && (
                            <div style={{ position:"absolute", top:3, right:5, fontSize:12, color:C.textDim }}>—</div>
                          )}

                          {/* Result feedback */}
                          {locked && (
                            <div style={{ marginTop:3, fontSize:11, color: correct?C.green:C.red, fontWeight:800,
                              display:"flex", alignItems:"center", gap:3 }}>
                              {correct ? "✓" : `✗ ${p.answer}`}
                            </div>
                          )}

                          {/* AI Hint button */}
                          {locked && wrong && !hints[i] && (
                            <button onClick={() => fetchHint(i, p, val)}
                              style={{ marginTop:4, fontSize:9, padding:"2px 6px", background:C.bgFlat,
                                border:`1.5px solid ${C.gold}`, cursor:"pointer", fontWeight:700, color:C.gold }}>
                              💡 Hint
                            </button>
                          )}
                          {locked && wrong && hints[i] && (
                            <div style={{ marginTop:6, fontSize:11, fontWeight:700, color:C.textSub, lineHeight:1.5 }}>
                              {hints[i].loading ? "…" : hints[i].text}
                            </div>
                          )}

                          {/* Review tag */}
                          {p.isReview && <div style={{ position:"absolute", bottom:3, left:5, fontSize:6, color:C.purple, fontFamily:PX }}>♻</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Page action button */}
                  <div style={{ marginTop:14, display:"flex", gap:10, justifyContent:"flex-end" }}>
                    {!pageAllLocked ? (
                      <button onClick={submitCurrentPage} className="fun-btn" style={S.btn(C.purpleMid, C.shadow)}>
                        Submit Page {currentPage + 1}
                      </button>
                    ) : currentPage < totalPages - 1 ? (
                      <button onClick={advancePage} className="fun-btn" style={S.btn(C.green, C.greenBg)}>
                        Next Page →
                      </button>
                    ) : (
                      <button onClick={finishSession} className="fun-btn" style={S.btn(C.green, C.greenBg)}>
                        Complete Quest! ⭐
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Daily challenge card — below worksheet */}
            {dailyChallenge && (
              <div className={dailyChallenge.completed ? "" : "quest-float"}
                style={{ ...S.card, borderLeft:`6px solid ${C.gold}`, background: dailyChallenge.completed ? C.greenBg : C.bgCard }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:900, fontFamily:PX, color:C.gold, lineHeight:1.8 }}>⭐ Daily Quest</span>
                  {!dailyChallenge.completed && <span style={{ fontSize:11, color:C.textSub, fontStyle:"italic" }}>— {dailyChallenge.flavour}</span>}
                </div>
                {dailyChallenge.completed ? (
                  <div style={{ fontSize:16, fontWeight:900, color:C.green }}>✓ Quest complete! Well done! 🌟</div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <span style={{ fontSize:22, fontWeight:900, color:C.text, fontFamily:PX }}>
                      {dailyChallenge.a} {dailyChallenge.op} {dailyChallenge.b} =
                    </span>
                    <input
                      value={dailyAnswer} inputMode="decimal"
                      onChange={e => setDailyAnswer(e.target.value.replace(/[^0-9./-]/g, ""))}
                      onKeyDown={e => { if (e.key === "Enter" && dailyAnswer !== "") {
                        if (String(dailyAnswer).trim() === String(dailyChallenge.answer)) completeDailyChallenge();
                        else setDailyAnswer("");
                      }}}
                      style={{ width:72, height:48, fontSize:22, fontWeight:900,
                        border:`3px solid ${C.gold}`, background:"#231760", color:C.text,
                        textAlign:"center", fontFamily:"'Nunito',sans-serif",
                        boxShadow:`0 0 8px ${C.gold}44` }}
                      placeholder="?"
                    />
                    <button
                      onClick={() => { if (dailyAnswer !== "") {
                        if (String(dailyAnswer).trim() === String(dailyChallenge.answer)) completeDailyChallenge();
                        else setDailyAnswer("");
                      }}}
                      className="fun-btn" style={S.btn(C.gold, C.goldDim)}>
                      Check ⚡
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI Insight — below worksheet */}
            {mistakeInsight && (
              <div style={{ ...S.card, background:C.bgCard, borderLeft:`6px solid ${C.purpleMid}` }}>
                <div style={{ fontSize:10, fontWeight:900, fontFamily:PX, color:C.purple, marginBottom:4, lineHeight:1.8 }}>🔮 Oracle Insight</div>
                <div style={{ fontSize:13, color:C.textSub, fontStyle:"italic", lineHeight:1.6 }}>{mistakeInsight}</div>
              </div>
            )}

            {/* Results panel */}
            {done && lastResult && (
              <div style={{ ...S.card, borderColor: lastResult.justMastered ? C.gold : lastResult.encouragement?.type === "success" ? C.green : lastResult.encouragement?.type === "info" ? C.purple : C.red, borderWidth:4 }}>
                <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{lastResult.encouragement?.emoji}</div>
                    <div style={S.h(12)}>{lastResult.encouragement?.headline}</div>
                    <div style={{ ...S.sub, marginTop:6, maxWidth:480, lineHeight:1.6 }}>{lastResult.encouragement?.body}</div>
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[
                      { label:"Correct", val:`${score.correct}/${score.total}`, color: score.accuracy >= ACCURACY_THRESHOLD ? C.green : C.gold },
                      { label:"Accuracy", val:`${lastResult.accuracy}%`, color: lastResult.accuracy >= ACCURACY_THRESHOLD ? C.green : C.gold },
                      ...(isSpeedPhase ? [{ label:"Time", val:lastResult.time != null ? formatTime(lastResult.time) : "—", color: lastResult.time <= currentLevel.masteryTime ? C.green : C.gold }] : []),
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ textAlign:"center", padding:"10px 14px", background:C.bgAlt, border:`2px solid ${C.border}` }}>
                        <div style={{ fontSize:11, color:C.textSub, fontWeight:700 }}>{label}</div>
                        <div style={{ fontSize:22, fontWeight:900, color, marginTop:2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speed phase pass tracker */}
                {isSpeedPhase && (
                  <div style={{ marginTop:12, padding:"10px 14px", background:C.bgFlat, border:`2px solid ${C.gold}`, display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:C.gold }}>Mastery passes:</span>
                    <PhaseIndicator passes={lastResult.speedPasses} />
                    <span style={{ fontSize:12, fontWeight:700, color:C.gold }}>{lastResult.speedPasses}/{SPEED_PASSES_NEEDED}</span>
                  </div>
                )}

                {/* Slowest questions tip */}
                {Object.keys(questionTimings).length > 3 && (
                  <div style={{ marginTop:10, padding:"10px 12px", background:C.bgAlt, border:`2px solid ${C.border}` }}>
                    <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:6 }}>Slowest questions — focus on these:</div>
                    {Object.entries(questionTimings).sort((a,b) => b[1]-a[1]).slice(0,3).map(([idx,ms]) => {
                      const p = problems[Number(idx)];
                      return p ? <div key={idx} style={{ fontSize:13, color:C.textSub, marginTop:3 }}>{p.a} {p.op} {p.b} = {p.answer} → <strong style={{ color:C.text }}>{formatMs(ms)}</strong></div> : null;
                    })}
                  </div>
                )}

                <div style={{ marginTop:12 }}>
                  <button onClick={startSession} className="fun-btn" style={S.btn(C.purpleMid, C.shadow)}>Try Again</button>
                </div>
              </div>
            )}
          {/* ── Motivational footer strip ── */}
          {!done && (
            <div style={{ marginTop:4, padding:"10px 16px", background:C.bgFlat,
              border:`2px solid ${C.border}`, display:"flex", alignItems:"center",
              justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:13 }}>🔥</span>
                <span style={{ fontSize:12, color:C.textSub, fontWeight:700 }}>
                  {streak > 0
                    ? `${streak}-day streak — keep it going!`
                    : "Start your streak — practise every day!"}
                </span>
              </div>
              <div style={{ display:"flex", gap:16 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:900, color:C.gold }}>{masteredCount}</div>
                  <div style={{ fontSize:9, color:C.textDim, fontWeight:700 }}>mastered</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:900, color:C.purple }}>{flatLevels.length - masteredCount}</div>
                  <div style={{ fontSize:9, color:C.textDim, fontWeight:700 }}>remaining</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:900, color:C.green }}>{overallPct}%</div>
                  <div style={{ fontSize:9, color:C.textDim, fontWeight:700 }}>complete</div>
                </div>
              </div>
            </div>
          )}
        </>
        )}

        {/* ═══════════════ JOURNEY MAP ═══════════════ */}
        {activeTab === "journey" && (
          <div style={S.card}>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:6 }}>
              <img src={`/char-${profile.character||"mage"}.png`} alt="Your hero" style={{ imageRendering:"pixelated", width:80, height:"auto", flexShrink:0 }} />
              <div>
                <div style={S.h(12)}>Journey Map</div>
                <p style={{ ...S.sub, marginTop:4, fontStyle:"italic" }}>"{overallPct < 25 ? "Your journey begins. Stay focused." : overallPct < 50 ? "Good progress. Keep pushing forward." : overallPct < 75 ? "You are becoming a true mathematician." : overallPct < 100 ? "Almost there. Mastery is within reach." : "You have mastered all levels. Impressive."}"</p>
              </div>
            </div>
            <p style={{ ...S.sub, marginBottom:16 }}>Each level has two phases: Accuracy first, then Speed. Master both to unlock the next level.</p>
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:700, marginBottom:5, color:C.textSub }}>
                <span>Overall mastery</span><span>{masteredCount} of {flatLevels.length} levels ({overallPct}%)</span>
              </div>
              <div style={{ width:"100%", height:18, background:C.bgAlt, border:BD, overflow:"hidden" }}>
                <div style={{ width:`${overallPct}%`, height:"100%", background:C.gold, transition:"width 0.4s" }} />
              </div>
            </div>
            {CURRICULUM.map(section => (
              <div key={section.id} style={{ ...S.flat, borderLeft:`6px solid ${section.color}`, marginBottom:14 }}>
                <div style={{ fontWeight:900, fontSize:16, color:C.purple, marginBottom:3 }}>{section.name}</div>
                <div style={{ fontSize:12, color:C.textSub, fontWeight:700, marginBottom:10, lineHeight:1.5 }}>💡 {section.tip}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:8 }}>
                  {section.levels.map(level => {
                    const state = getLevelState(level.id, levelProgress);
                    const prog = levelProgress[level.id] || {};
                    const isLocked = state === LS.LOCKED;
                    const isMastered = state === LS.MASTERED;
                    const sc = stateColor[state];
                    return (
                      <button key={level.id} onClick={() => !isLocked && practiceLevel(level.id)} className={isLocked ? "" : "fun-btn"}
                        style={{ textAlign:"left", border:`4px solid ${isLocked?C.border:sc}`, padding:12, background:isMastered?C.greenBg:state===LS.SPEED?`${C.gold}11`:state===LS.ACCURACY?`${C.purple}11`:C.bgAlt, cursor:isLocked?"not-allowed":"pointer", boxShadow:isLocked?"none":`4px 4px 0 ${sc}`, opacity:isLocked?0.55:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                          <div style={{ fontWeight:900, fontSize:13, color:isLocked?C.textDim:C.purple }}>{level.title}</div>
                          <span style={{ fontFamily:PX, fontSize:7, color:sc, lineHeight:1.6, whiteSpace:"nowrap" }}>
                            {isMastered?"✓":state===LS.SPEED?"⚡":state===LS.ACCURACY?"🎯":"🔒"}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:C.textSub, fontWeight:700, marginTop:3 }}>{level.skill}</div>
                        <div style={{ marginTop:8, display:"flex", justifyContent:"space-between", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:C.textDim }}>Target: {formatTime(level.masteryTime)}</span>
                          {prog.bestTime != null && <span style={{ fontSize:11, fontWeight:800, color:C.green }}>Best: {formatTime(prog.bestTime)}</span>}
                        </div>
                        {state === LS.SPEED && (
                          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:C.gold }}>Passes:</span>
                            <PhaseIndicator passes={prog.speedPasses || 0} size={14} />
                          </div>
                        )}
                        {state === LS.ACCURACY && prog.bestAccuracy > 0 && (
                          <div style={{ marginTop:4, fontSize:11, fontWeight:700, color:C.purple }}>Best accuracy: {prog.bestAccuracy}%</div>
                        )}
                        {isMastered && (() => {
                          const lb = LEVEL_BADGE_DEFS.find(b => b.levelId === level.id);
                          return lb ? (
                            <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:6, padding:"4px 8px",
                              background:`${section.color}22`, border:`2px solid ${section.color}44` }}>
                              <BadgeImg src={lb.image} color={section.color} earned size={20} />
                              <span style={{ fontSize:10, fontWeight:800, color:section.color }}>{lb.label}</span>
                            </div>
                          ) : null;
                        })()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════ BADGES ═══════════════ */}
        {activeTab === "badges" && (() => {
          const earnedCount = badges.length;
          const totalCount = ALL_BADGE_DEFS.length;
          return (
            <>
              <BadgeDetailModal badge={selectedBadge} earned={selectedBadge ? badges.includes(selectedBadge.id) : false} onClose={() => setSelectedBadge(null)} />

              {/* Summary card */}
              <div style={{ ...S.card, borderLeft:`8px solid ${C.gold}`, display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ flex:1 }}>
                  <div style={S.h(12)}>Badge Collection</div>
                  <p style={{ ...S.sub, marginTop:4 }}>{earnedCount} of {totalCount} badges earned — tap any badge to see details.</p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:C.gold }}>{earnedCount}</div>
                  <div style={{ fontSize:12, color:"#6b5e9e", fontWeight:700 }}>/ {totalCount}</div>
                </div>
              </div>

              {/* ── Journey Badges section ── */}
              <div style={{ ...S.card }}>
                <div style={{ fontFamily:PX, fontSize:9, color:C.purple, lineHeight:1.8, marginBottom:16,
                  borderBottom:`3px solid ${C.gold}`, paddingBottom:8 }}>
                  ★ Journey Badges — one for each level mastered
                </div>
                {CURRICULUM.map(section => {
                  const sectionLevelBadges = LEVEL_BADGE_DEFS.filter(b => b.sectionId === section.id);
                  const sectionEarned = sectionLevelBadges.filter(b => badges.includes(b.id)).length;
                  return (
                    <div key={section.id} style={{ marginBottom:20 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                        <div style={{ width:4, height:20, background:section.color }} />
                        <span style={{ fontWeight:900, fontSize:13, color:C.purple }}>{section.name}</span>
                        <span style={{ fontSize:11, color:C.textSub, fontWeight:700 }}>{sectionEarned}/{sectionLevelBadges.length}</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))", gap:8 }}>
                        {sectionLevelBadges.map(b => {
                          const earned = badges.includes(b.id);
                          return (
                            <button key={b.id} onClick={() => setSelectedBadge(b)}
                              style={{ border:`3px solid ${earned ? b.color : C.border}`, padding:"10px 6px",
                                background: earned ? `${b.color}15` : C.bgAlt,
                                boxShadow: earned ? `3px 3px 0 ${b.color}55` : "none",
                                cursor:"pointer", textAlign:"center", transition:"transform 0.1s" }}
                              className="fun-btn">
                              <BadgeImg src={b.image} color={b.color} earned={earned} size={44} />
                              <div style={{ fontSize:9, fontWeight:900, color: earned ? b.color : C.textDim,
                                marginTop:5, lineHeight:1.3, wordBreak:"break-word" }}>{b.label}</div>
                              {earned && <div style={{ fontFamily:PX, fontSize:5, color:b.color, marginTop:3 }}>✓</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Achievement Badges section ── */}
              <div style={{ ...S.card }}>
                <div style={{ fontFamily:PX, fontSize:9, color:C.purple, lineHeight:1.8, marginBottom:16,
                  borderBottom:`3px solid ${C.gold}`, paddingBottom:8 }}>
                  ✦ Achievement Badges
                </div>
                {[1,2,3,4,5].map(tier => {
                  const tierInfo = TIER_INFO[tier];
                  const tierBadges = BADGE_DEFS.filter(b => b.tier === tier);
                  const tierEarned = tierBadges.filter(b => badges.includes(b.id)).length;
                  return (
                    <div key={tier} style={{ marginBottom:24 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10,
                        borderBottom:`2px solid ${tierInfo.color}44`, paddingBottom:6 }}>
                        <div style={{ fontFamily:PX, fontSize:7, color:tierInfo.color, lineHeight:1.8 }}>✦ {tierInfo.label}</div>
                        <div style={{ fontSize:11, color:C.textSub, fontWeight:700 }}>{tierEarned}/{tierBadges.length}</div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10 }}>
                        {tierBadges.map(b => {
                          const earned = badges.includes(b.id);
                          return (
                            <button key={b.id} onClick={() => setSelectedBadge(b)}
                              style={{ border:`3px solid ${earned ? b.color : C.border}`, padding:12,
                                background: earned ? `${b.color}11` : C.bgAlt,
                                boxShadow: earned ? `4px 4px 0 ${b.color}44` : "none",
                                display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer",
                                textAlign:"left" }}
                              className="fun-btn">
                              <BadgeImg src={b.image} color={b.color} earned={earned} size={44} />
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:900, fontSize:12, color: earned ? b.color : C.textDim, lineHeight:1.3 }}>{b.label}</div>
                                <div style={{ fontSize:10, color:C.textSub, fontWeight:700, marginTop:3, lineHeight:1.4 }}>{b.desc}</div>
                                {earned && <div style={{ marginTop:4, fontFamily:PX, fontSize:5, color:b.color, lineHeight:1.8 }}>✓ EARNED</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

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
                    <div style={{ fontWeight:900, fontSize:20, color:s.accuracy>=ACCURACY_THRESHOLD?C.green:s.accuracy>=80?C.gold:C.red }}>{s.accuracy}%</div>
                    <div style={S.sub}>{s.correct}/{s.total} · {s.timeLabel}</div>
                    {s.phase==="Speed" && <div style={{ fontSize:11, fontWeight:800, color:s.passed&&s.onTime?C.green:s.passed?C.gold:C.red, marginTop:2 }}>
                      {s.passed && s.onTime ? "✓ Speed pass" : s.passed ? "Accurate, not fast enough" : "Needs more accuracy"}
                    </div>}
                  </div>
                </div>
                {s.slowest?.length > 0 && (
                  <div style={{ marginTop:8, padding:"8px 10px", background:C.bgCard, border:`2px solid ${C.border}` }}>
                    <div style={{ fontSize:11, fontWeight:800, marginBottom:4, color:C.text }}>Slowest questions:</div>
                    {s.slowest.map((q, i) => <div key={i} style={{ fontSize:12, color:C.textSub, marginTop:i>0?3:0 }}>{q.label} → <strong style={{ color:C.text }}>{formatMs(q.ms)}</strong></div>)}
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
                {pinError && <p style={{ color:C.red, fontWeight:700, marginTop:8 }}>{pinError}</p>}
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
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:10 }}>Choose your hero</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                    {CHARACTERS.map(ch => (
                      <div key={ch.id} onClick={() => updateProfile({ character: ch.id })}
                        style={{ cursor:"pointer", textAlign:"center", padding:"8px 4px",
                          border: profile.character===ch.id?`3px solid ${ch.color}`:"3px solid transparent",
                          background: profile.character===ch.id?"rgba(255,255,255,0.07)":"transparent",
                          boxShadow: profile.character===ch.id?`0 0 12px ${ch.color}55`:"none",
                          transition:"all 0.15s" }}>
                        <img src={`/char-${ch.id}.png`} alt={ch.label}
                          style={{ imageRendering:"pixelated", width:52, height:52, display:"block", margin:"0 auto 4px" }} />
                        <div style={{ fontSize:10, fontWeight:900, color: profile.character===ch.id?ch.color:C.text }}>{ch.label}</div>
                      </div>
                    ))}
                  </div>
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
                  {pinError && <p style={{ color:C.red, fontWeight:700, marginTop:8 }}>{pinError}</p>}
                  {pinSuccess && <p style={{ color:C.green, fontWeight:700, marginTop:8 }}>{pinSuccess}</p>}
                </div>
                <div style={{ ...S.flat, marginBottom:14 }}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:6 }}>Cloud Sync PIN</div>
                  <p style={S.sub}>Your progress syncs between devices using a 6-digit PIN you choose. Enter the same PIN on any device to load your progress.</p>
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontWeight:700, marginBottom:8, color:C.text }}>Current PIN: <span style={{ fontFamily:"monospace", fontSize:18, letterSpacing:4, background:C.bgAlt, padding:"2px 8px", border:`1px solid ${C.border}` }}>{syncPin || "None"}</span></div>
                    <div style={{ ...S.sub, color: syncStatus==="saved"?C.green:syncStatus==="error"?C.red:syncStatus==="syncing"?C.gold:C.textSub }}>
                      {syncStatus==="saved"?"✓ Saved to cloud":syncStatus==="error"?"✗ Sync error":syncStatus==="syncing"?"↑ Syncing…":syncPin?"Cloud sync active":"No PIN — progress saved locally only"}
                    </div>
                  </div>
                </div>
                <div style={{ ...S.flat, marginBottom:14 }}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:6 }}>Sign out</div>
                  <p style={S.sub}>Returns to the home screen. Your progress is saved and you can sign back in with your PIN.</p>
                  <div style={{ marginTop:10 }}>
                    <button onClick={() => { setStaySignedIn(false); setAppPhase(PHASE.LANDING); }} className="fun-btn" style={S.btn("#7c3aed","#3b0764")}>Sign Out</button>
                  </div>
                </div>
                <div style={S.flat}>
                  <div style={{ fontWeight:900, fontSize:16, marginBottom:6 }}>Reset profiles</div>
                  <p style={S.sub}>Erases all progress, badges, and history.</p>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:10 }}>
                    <button onClick={() => resetProfile(activeProfileId)} className="fun-btn" style={S.btn("#ef4444","#7f1d1d")}>Reset My Progress</button>
                  </div>
                </div>

                {/* ── AI Parent Features ── */}
                {!parentTierUnlocked ? (
                  <div style={{ ...S.flat, position:"relative", overflow:"hidden" }}>
                    {/* Upgrade banner */}
                    <div style={{ textAlign:"center", padding:"20px 16px" }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>👑</div>
                      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:10, color:"#fbbf24", lineHeight:1.8, marginBottom:8 }}>
                        Parent Features
                      </div>
                      <p style={{ ...S.sub, marginBottom:16, maxWidth:320, margin:"0 auto 16px" }}>
                        Unlock AI-powered tools for parents — progress chat, homework scanner, custom question packs and goal tracking.
                      </p>
                      <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
                        {["🤖 Progress Chat","📦 Custom Packs","📷 Homework Scanner","🎯 Goal Tracking"].map(f => (
                          <div key={f} style={{ fontSize:12, color:"#9b80d4", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ color:"#fbbf24" }}>★</span> {f}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:13, color:"#fbbf24", marginBottom:4 }}>£3.99 / month</div>
                      <div style={{ fontSize:12, color:"#9b80d4", fontWeight:700, marginBottom:16 }}>Cancel anytime · Instant access</div>
                      <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                        <button onClick={() => setShowUpgradeModal(true)} className="fun-btn"
                          style={{ border:"4px solid #fbbf24", background:"#fbbf24", color:"#111",
                            fontFamily:"'Press Start 2P',monospace", fontSize:9, padding:"12px 20px",
                            cursor:"pointer", boxShadow:"4px 4px 0 #92400e", lineHeight:1.8 }}>
                          Unlock Now →
                        </button>
                        <button onClick={() => { setShowUpgradeModal(true); }} className="fun-btn"
                          style={{ border:"3px solid #2a1f4a", background:"transparent", color:"#9b80d4",
                            fontFamily:"'Press Start 2P',monospace", fontSize:9, padding:"12px 14px", cursor:"pointer" }}>
                          I've paid
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Unlocked badge */}
                    <div style={{ ...S.flat, marginBottom:14, display:"flex", alignItems:"center", gap:12,
                      background:"rgba(251,191,36,0.06)", border:`2px solid #fbbf2440` }}>
                      <div style={{ fontSize:24 }}>👑</div>
                      <div>
                        <div style={{ fontWeight:900, fontSize:14, color:"#fbbf24" }}>Parent Features — Active</div>
                        <div style={{ fontSize:12, color:"#9b80d4", fontWeight:700 }}>{appSettings.parentTierEmail}</div>
                      </div>
                    </div>

                    <div style={{ ...S.flat, marginBottom:14 }}>
                      <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>🤖 Progress Chat</div>
                      <p style={S.sub}>Ask Claude anything about {profile.name}'s progress.</p>
                      <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                        <input value={progressQuery} onChange={e => setProgressQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") askProgressQuestion(); }}
                          placeholder={`e.g. "How is ${profile.name} doing?"`}
                          style={{ ...S.settingInp, flex:1, minWidth:200 }} />
                        <button onClick={askProgressQuestion} disabled={progressLoading} className="fun-btn" style={S.btn()}>
                          {progressLoading ? "…" : "Ask"}
                        </button>
                      </div>
                      {progressResponse && (
                        <div style={{ marginTop:10, padding:"10px 14px", background:C.bgCard, border:`2px solid ${C.purple}40`, fontSize:13, color:C.textSub, lineHeight:1.6 }}>
                          {progressResponse}
                        </div>
                      )}
                    </div>

                    <div style={{ ...S.flat, marginBottom:14 }}>
                      <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>📦 Custom Question Pack</div>
                      <p style={S.sub}>Type a topic and Claude generates 36 questions.</p>
                      <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                        <input value={customPackTopic} onChange={e => setCustomPackTopic(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") generateCustomPack(); }}
                          placeholder="e.g. 7 times table, adding to 100…"
                          style={{ ...S.settingInp, flex:1, minWidth:200 }} />
                        <button onClick={generateCustomPack} disabled={customPackLoading} className="fun-btn" style={S.btn()}>
                          {customPackLoading ? "Generating…" : "Generate"}
                        </button>
                      </div>
                    </div>

                    <div style={{ ...S.flat, marginBottom:14 }}>
                      <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>📷 Homework Helper</div>
                      <p style={S.sub}>Take a photo of a maths worksheet — Claude turns it into a practice session.</p>
                      <div style={{ marginTop:10 }}>
                        <label style={{ display:"inline-block", padding:"8px 16px", background:C.purpleMid, color:"#fff", border:`2px solid ${C.borderHi}`, boxShadow:`3px 3px 0 ${C.shadow}`, cursor:"pointer", fontWeight:700, fontSize:13 }}>
                          {homeworkLoading ? "Reading worksheet…" : "📷 Upload Photo"}
                          <input type="file" accept="image/*" capture="environment" onChange={processHomework}
                            style={{ display:"none" }} disabled={homeworkLoading} />
                        </label>
                      </div>
                    </div>

                    <div style={S.flat}>
                      <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>🎯 Goal Setting</div>
                      <p style={S.sub}>Set a learning goal and check if {profile.name} is on track.</p>
                      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8, maxWidth:400 }}>
                        <input value={goalInput} onChange={e => setGoalInput(e.target.value)}
                          placeholder="e.g. Master all times tables"
                          style={{ ...S.settingInp, width:"100%" }} />
                        <input type="date" value={goalDeadlineInput} onChange={e => setGoalDeadlineInput(e.target.value)}
                          style={{ ...S.settingInp, width:"100%" }} />
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <button onClick={() => { updateProfile({ goal: goalInput, goalDeadline: goalDeadlineInput }); }} className="fun-btn" style={S.btn(C.green, C.greenBg)}>Save Goal</button>
                          <button onClick={checkGoalProgress} disabled={goalLoading} className="fun-btn" style={S.btn()}>
                            {goalLoading ? "Checking…" : "Check Progress"}
                          </button>
                        </div>
                      </div>
                      {goalAssessment && (
                        <div style={{ marginTop:10, padding:"10px 14px", background:C.greenBg, border:`2px solid ${C.green}40`, fontSize:13, color:C.green, lineHeight:1.6 }}>
                          {goalAssessment}
                        </div>
                      )}
                      {profile.goal && (
                        <div style={{ marginTop:8, fontSize:12, color:C.textSub }}>
                          Current goal: <strong style={{ color:C.text }}>{profile.goal}</strong>{profile.goalDeadline ? ` by ${profile.goalDeadline}` : ""}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
