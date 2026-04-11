// Regenerate the 3 elements that missed on the first pass
import fs from "fs";
import path from "path";
import https from "https";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-ui2.mjs YOUR_API_KEY"); process.exit(1); }

const OUT_DIR = "./public/ui";
fs.mkdirSync(OUT_DIR, { recursive: true });

const ELEMENTS = [
  {
    file: "divider.png",
    width: 400,
    height: 16,
    prompt: "pixel art horizontal UI divider, thin dark stone bar with a small golden diamond gem in the exact center, gold and dark brown colors only, no pink, no purple, transparent background, wide and very thin, sharp pixel art",
    guidance: 14,
  },
  {
    file: "gem.png",
    width: 48,
    height: 48,
    prompt: "pixel art purple amethyst gemstone, single faceted gem crystal, top view, hexagonal cut, deep purple violet color with bright highlight, transparent background, RPG UI item icon, sharp pixel art, no character, no fire",
    guidance: 15,
  },
  {
    file: "star-bullet.png",
    width: 32,
    height: 32,
    prompt: "pixel art gold 5-pointed star icon, bright yellow gold color, simple clean star shape with glow effect, transparent background, 32x32, sharp pixel art, no red, no pink",
    guidance: 14,
  },
];

async function generate({ file, width, height, prompt, guidance }) {
  console.log(`Generating ${file}…`);
  const body = JSON.stringify({
    description: prompt,
    image_size: { width, height },
    no_background: true,
    text_guidance_scale: guidance,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname:"api.pixellab.ai", path:"/v1/generate-image-pixflux", method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const b64 = json.image?.base64 || json.image?.data;
            if (b64) {
              const buf = Buffer.from(b64, "base64");
              const outPath = path.join(OUT_DIR, file);
              fs.writeFileSync(outPath, buf);
              console.log(`  ✓ Saved ${outPath} (${buf.length} bytes)`);
            } else {
              console.error(`  ✗ Bad response:`, JSON.stringify(json).slice(0, 200));
            }
            resolve();
          } catch (e) { console.error(`  ✗ Parse error:`, e.message); resolve(); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

for (const el of ELEMENTS) {
  await generate(el);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("\nDone!");
