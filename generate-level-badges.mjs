// Generate one badge image per curriculum level (29 total)
// Usage: node generate-level-badges.mjs YOUR_PIXELLAB_API_KEY
import fs from "fs";
import path from "path";
import https from "https";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-level-badges.mjs YOUR_API_KEY"); process.exit(1); }

const OUT_DIR = "./public/badges";
fs.mkdirSync(OUT_DIR, { recursive: true });

const LEVEL_BADGES = [
  // Foundations (green)
  { id:"add-1",      desc:"pixel art badge icon, green shield with a glowing +1 rune, addition foundations, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"add-2",      desc:"pixel art badge icon, green shield with +2 carved in stone, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"add-3",      desc:"pixel art badge icon, green shield with +3 emerald inscription, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"doubles",    desc:"pixel art badge icon, two identical green gems side by side, doubles spell award, dark fantasy RPG style, transparent background, 64x64" },
  { id:"add-mix-10", desc:"pixel art badge icon, green forest gate with number 10 arch, mixed addition to 10, dark fantasy RPG style, transparent background, 64x64" },
  { id:"make-10",    desc:"pixel art badge icon, green glowing number 10 formed by two joining stones, bridging to ten, dark fantasy RPG style, transparent background, 64x64" },
  // Addition to 20 (blue)
  { id:"add-teen-1", desc:"pixel art badge icon, blue castle tower with +1 flag, teen plus one, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"add-teen-3", desc:"pixel art badge icon, blue castle tower with +3 banner, teen plus three, dark fantasy RPG style, transparent background, 64x64" },
  { id:"near-double",desc:"pixel art badge icon, two blue stars almost touching, near doubles spell, dark fantasy RPG style, transparent background, 64x64" },
  { id:"add-mix-20", desc:"pixel art badge icon, blue sky castle with number 20 on gate, fluent addition to 20, dark fantasy RPG style, transparent background, 64x64" },
  // Subtraction (purple)
  { id:"sub-1",      desc:"pixel art badge icon, purple shield with minus 1 rune, subtraction basics, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"sub-3",      desc:"pixel art badge icon, purple castle wall with minus 3 carved stone, dark fantasy RPG style, transparent background, 64x64" },
  { id:"sub-bridge", desc:"pixel art badge icon, purple stone bridge crossing a gap over number 10, bridging subtraction, dark fantasy RPG style, transparent background, 64x64" },
  { id:"sub-mix-20", desc:"pixel art badge icon, purple dungeon door with minus 20 inscription, fluent subtraction to 20, dark fantasy RPG style, transparent background, 64x64" },
  // Place Value (amber)
  { id:"pv-10",      desc:"pixel art badge icon, amber desert pillar with tens column, ten more less, dark fantasy RPG style, transparent background, 64x64" },
  { id:"pv-add-10s", desc:"pixel art badge icon, amber pyramid with plus symbol and tens, adding tens, dark fantasy RPG style, transparent background, 64x64" },
  { id:"pv-sub-10s", desc:"pixel art badge icon, amber sphinx with minus symbol and tens, subtracting tens, dark fantasy RPG style, transparent background, 64x64" },
  // Add & Subtract to 100 (red)
  { id:"add-no-carry",  desc:"pixel art badge icon, red volcano with simple plus sign, addition no carrying, dark fantasy RPG style, transparent background, 64x64" },
  { id:"add-carry",     desc:"pixel art badge icon, red volcano erupting with carry digit flying, addition with carrying, dark fantasy RPG style, transparent background, 64x64" },
  { id:"sub-no-borrow", desc:"pixel art badge icon, red fortress wall with minus sign, subtraction no borrowing, dark fantasy RPG style, transparent background, 64x64" },
  { id:"sub-borrow",    desc:"pixel art badge icon, red fortress crumbling with borrow arrow, subtraction with borrowing, dark fantasy RPG style, transparent background, 64x64" },
  { id:"mixed-100",     desc:"pixel art badge icon, red battle axe crossed with plus and minus, mixed operations to 100, dark fantasy RPG style, transparent background, 64x64" },
  // Multiplication (cyan)
  { id:"times-2",    desc:"pixel art badge icon, cyan ocean wave with x2 symbol, times two table, dark fantasy RPG style, gold border, transparent background, 64x64" },
  { id:"times-5",    desc:"pixel art badge icon, cyan sea crystal with x5 carved, times five table, dark fantasy RPG style, transparent background, 64x64" },
  { id:"times-10",   desc:"pixel art badge icon, cyan ocean tower with x10 banner, times ten table, dark fantasy RPG style, transparent background, 64x64" },
  { id:"times-3-4",  desc:"pixel art badge icon, cyan trident with 3 and 4 prongs glowing, times three and four, dark fantasy RPG style, transparent background, 64x64" },
  { id:"times-6-7",  desc:"pixel art badge icon, cyan deep sea serpent with 6 and 7 scales, times six and seven, dark fantasy RPG style, transparent background, 64x64" },
  { id:"times-8-9",  desc:"pixel art badge icon, cyan kraken with 8 and 9 tentacles, times eight and nine, dark fantasy RPG style, transparent background, 64x64" },
  { id:"times-mixed",desc:"pixel art badge icon, cyan ocean maelstrom with multiplication cross in centre, all times tables, dark fantasy RPG style, transparent background, 64x64" },
  // Division (teal)
  { id:"div-2-5-10", desc:"pixel art badge icon, teal forest tree split three ways, division by 2 5 and 10, dark fantasy RPG style, transparent background, 64x64" },
  { id:"div-3-4",    desc:"pixel art badge icon, teal enchanted grove with division symbol carved on bark, division 3 and 4, dark fantasy RPG style, transparent background, 64x64" },
  { id:"div-facts",  desc:"pixel art badge icon, teal ancient forest temple with division rune, all division facts, dark fantasy RPG style, transparent background, 64x64" },
  { id:"mult-div",   desc:"pixel art badge icon, teal yin yang symbol with multiplication and division signs, times and divide mix, dark fantasy RPG style, transparent background, 64x64" },
];

async function generate({ id, desc }) {
  const file = `level_${id}.png`;
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
            if (b64) { fs.writeFileSync(outPath, Buffer.from(b64, "base64")); console.log("✓"); }
            else { console.log("✗", JSON.stringify(json).slice(0,120)); }
          } catch(e) { console.log("✗", e.message); }
          resolve();
        });
      }
    );
    req.on("error", e => { console.log("✗", e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

console.log(`Generating ${LEVEL_BADGES.length} level badge images into ${OUT_DIR}/\n`);
for (const badge of LEVEL_BADGES) {
  await generate(badge);
  await new Promise(r => setTimeout(r, 1200));
}
console.log("\nAll done!");
