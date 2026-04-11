// Generate all 47 badge images for Maths Mastery
// Usage: node generate-badges.mjs YOUR_API_KEY
import fs from "fs";
import path from "path";
import https from "https";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-badges.mjs YOUR_API_KEY"); process.exit(1); }

const OUT_DIR = "./public/badges";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Each badge: file, colour hint, description for pixel art icon
const BADGES = [
  // Common
  { file:"first_accuracy.png",  color:"green",   desc:"pixel art badge icon, green shield with a checkmark tick, dark fantasy RPG style, gold border, transparent background" },
  { file:"first_speed.png",     color:"blue",    desc:"pixel art badge icon, blue lightning bolt on dark shield, dark fantasy RPG style, gold border, transparent background" },
  { file:"first_master.png",    color:"amber",   desc:"pixel art badge icon, gold star on dark shield, level master award, dark fantasy RPG style, transparent background" },
  { file:"q100.png",            color:"amber",   desc:"pixel art badge icon, Roman numeral C (100) on bronze shield, centurion award, dark fantasy RPG style, transparent background" },
  { file:"streak3.png",         color:"orange",  desc:"pixel art badge icon, three orange flame icons in a row, streak award, dark fantasy RPG style, transparent background" },
  { file:"early_riser.png",     color:"yellow",  desc:"pixel art badge icon, golden sunrise over mountains, early morning award, dark fantasy RPG style, transparent background" },
  { file:"night_owl.png",       color:"indigo",  desc:"pixel art badge icon, purple owl with glowing eyes on dark background, night owl award, dark fantasy RPG style, transparent background" },
  { file:"comeback_kid.png",    color:"red",     desc:"pixel art badge icon, red phoenix rising from flames, comeback award, dark fantasy RPG style, transparent background" },
  // Uncommon
  { file:"five_master.png",     color:"purple",  desc:"pixel art badge icon, five purple stars arranged in a circle, rising star award, dark fantasy RPG style, transparent background" },
  { file:"personal_best.png",   color:"blue",    desc:"pixel art badge icon, blue stopwatch with a star, personal best record, dark fantasy RPG style, transparent background" },
  { file:"perfect.png",         color:"green",   desc:"pixel art badge icon, glowing green perfect circle with 100 inside, perfect score award, dark fantasy RPG style, transparent background" },
  { file:"q500.png",            color:"purple",  desc:"pixel art badge icon, purple gem with 500 engraved, 500 questions award, dark fantasy RPG style, transparent background" },
  { file:"streak7.png",         color:"red",     desc:"pixel art badge icon, seven red flames stacked, week streak award, dark fantasy RPG style, transparent background" },
  { file:"speed_demon.png",     color:"orange",  desc:"pixel art badge icon, orange devil with speed wings, speed demon award, dark fantasy RPG style, transparent background" },
  { file:"double_perfect.png",  color:"cyan",    desc:"pixel art badge icon, two cyan stars crossed, double perfect award, dark fantasy RPG style, transparent background" },
  { file:"q250.png",            color:"green",   desc:"pixel art badge icon, green shield with 250, questions milestone, dark fantasy RPG style, transparent background" },
  // Rare
  { file:"ten_master.png",      color:"pink",    desc:"pixel art badge icon, pink diamond with X (ten) engraved, ten levels mastered, dark fantasy RPG style, transparent background" },
  { file:"halfway.png",         color:"cyan",    desc:"pixel art badge icon, cyan half-filled shield, halfway through journey, dark fantasy RPG style, transparent background" },
  { file:"q1000.png",           color:"red",     desc:"pixel art badge icon, red ruby gem with 1000 carved in, thousand questions, dark fantasy RPG style, transparent background" },
  { file:"streak14.png",        color:"gold",    desc:"pixel art badge icon, gold calendar with 14 days marked, fortnight streak, dark fantasy RPG style, transparent background" },
  { file:"fifteen_master.png",  color:"violet",  desc:"pixel art badge icon, violet crown with 15 gems, the adept award, dark fantasy RPG style, transparent background" },
  { file:"triple_perfect.png",  color:"teal",    desc:"pixel art badge icon, teal hat trick symbol with three checkmarks, hat trick award, dark fantasy RPG style, transparent background" },
  { file:"streak30.png",        color:"amber",   desc:"pixel art badge icon, amber moon with 30 days, month of maths streak, dark fantasy RPG style, transparent background" },
  { file:"q2500.png",           color:"cyan",    desc:"pixel art badge icon, cyan crystal shard with 2500, questions milestone, dark fantasy RPG style, transparent background" },
  { file:"speed_master.png",    color:"red",     desc:"pixel art badge icon, red race flag with five stars, speed master award, dark fantasy RPG style, transparent background" },
  { file:"twenty_master.png",   color:"pink",    desc:"pixel art badge icon, pink laurel wreath with XX, twenty levels expert, dark fantasy RPG style, transparent background" },
  // Zone Trophies
  { file:"zone_foundations.png",    color:"green",  desc:"pixel art trophy badge, green forest arch with addition symbols, foundations zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_add20.png",          color:"blue",   desc:"pixel art trophy badge, blue sky castle tower with number 20, addition to 20 zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_subtraction.png",    color:"purple", desc:"pixel art trophy badge, purple castle wall with minus symbols, subtraction zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_place_value.png",    color:"amber",  desc:"pixel art trophy badge, amber desert pyramid with place value columns, place value zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_ops100.png",         color:"red",    desc:"pixel art trophy badge, red volcano with 100 on it, add subtract to 100 zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_multiplication.png", color:"cyan",   desc:"pixel art trophy badge, cyan ocean wave with multiplication cross, multiplication zone champion, dark fantasy RPG style, transparent background" },
  { file:"zone_division.png",       color:"teal",   desc:"pixel art trophy badge, teal forest tree with division symbol, division zone champion, dark fantasy RPG style, transparent background" },
  // Epic
  { file:"twentyfive_master.png",   color:"purple", desc:"pixel art badge icon, purple scholar robes with 25, the scholar award, dark fantasy RPG style, transparent background" },
  { file:"streak60.png",            color:"orange", desc:"pixel art badge icon, orange titan sword with 60 day streak flames, two month titan, dark fantasy RPG style, transparent background" },
  { file:"q5000.png",               color:"violet", desc:"pixel art badge icon, violet pentagonal gem with 5K, five thousand questions, dark fantasy RPG style, transparent background" },
  { file:"flawless_ten.png",        color:"teal",   desc:"pixel art badge icon, teal perfect crystal with 10 inside, flawless ten award, dark fantasy RPG style, transparent background" },
  { file:"all_zones.png",           color:"gold",   desc:"pixel art badge icon, gold world map with all zones lit, world beater award, dark fantasy RPG style, transparent background" },
  { file:"accuracy_master.png",     color:"green",  desc:"pixel art badge icon, green precision crosshair target with 20, accuracy master award, dark fantasy RPG style, transparent background" },
  // Legendary
  { file:"all_master.png",          color:"gold",   desc:"pixel art legendary badge, radiant gold crown floating over dark abyss, maths champion, legendary tier, dark fantasy RPG style, transparent background" },
  { file:"q10000.png",              color:"purple", desc:"pixel art legendary badge, glowing purple obelisk with 10000, ten thousand questions legend, dark fantasy RPG style, transparent background" },
  { file:"streak100.png",           color:"red",    desc:"pixel art legendary badge, blazing red inferno with 100 streak, centurion streak, legendary tier, dark fantasy RPG style, transparent background" },
  { file:"speed_legend.png",        color:"orange", desc:"pixel art legendary badge, orange comet trail with wings, speed legend, legendary tier, dark fantasy RPG style, transparent background" },
  { file:"grandmaster.png",         color:"gold",   desc:"pixel art legendary badge, gold dragon wrapped around a trophy, grandmaster award, legendary tier, dark fantasy RPG style, transparent background" },
  { file:"unstoppable.png",         color:"pink",   desc:"pixel art legendary badge, glowing magenta fist through a wall, unstoppable award, legendary tier, dark fantasy RPG style, transparent background" },
  { file:"the_legend.png",          color:"gold",   desc:"pixel art legendary badge, golden legendary seal with wizard staff and stars, the legend award, ultimate tier, dark fantasy RPG style, transparent background" },
];

async function generate({ file, desc }) {
  const outPath = path.join(OUT_DIR, file);
  if (fs.existsSync(outPath)) { console.log(`  ⏭  ${file} already exists, skipping`); return; }

  process.stdout.write(`Generating ${file}… `);
  const body = JSON.stringify({
    description: desc,
    image_size: { width: 64, height: 64 },
    no_background: true,
    text_guidance_scale: 13,
  });

  return new Promise((resolve) => {
    const req = https.request(
      { hostname:"api.pixellab.ai", path:"/v1/generate-image-pixflux", method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` } },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const b64 = json.image?.base64 || json.image?.data;
            if (b64) {
              fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
              console.log("✓");
            } else {
              console.log("✗", JSON.stringify(json).slice(0,120));
            }
          } catch(e) { console.log("✗ parse error:", e.message); }
          resolve();
        });
      }
    );
    req.on("error", e => { console.log("✗ request error:", e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

console.log(`Generating ${BADGES.length} badge images into ${OUT_DIR}/\n`);
for (const badge of BADGES) {
  await generate(badge);
  await new Promise(r => setTimeout(r, 1200));
}
console.log("\nAll done!");
