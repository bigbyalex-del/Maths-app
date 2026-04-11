// ── Generate dark fantasy pixel-art UI elements ────────────────────────────
// Usage: node generate-ui.mjs YOUR_API_KEY
// Output: public/ui/  (corner.png, divider.png, gem.png)

import fs from "fs";
import path from "path";
import https from "https";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-ui.mjs YOUR_API_KEY"); process.exit(1); }

const OUT_DIR = "./public/ui";
fs.mkdirSync(OUT_DIR, { recursive: true });

const ELEMENTS = [
  {
    file: "corner.png",
    width: 64,
    height: 64,
    prompt: "pixel art gothic stone corner ornament, dark fantasy, carved rune L-shape bracket, glowing purple crystal inset, dark stone texture, gold trim, transparent background, 64x64, sharp pixel art, no fill inside the L shape, just the corner piece",
    guidance: 12,
  },
  {
    file: "divider.png",
    width: 400,
    height: 24,
    prompt: "pixel art horizontal divider bar, dark fantasy, thin glowing purple magical line with small rune symbols and gold diamond accents in the centre, dark stone edges, transparent background, wide and thin, sharp pixel art style",
    guidance: 12,
  },
  {
    file: "gem.png",
    width: 80,
    height: 32,
    prompt: "pixel art small glowing purple crystal gem, dark fantasy RPG UI icon, faceted gem with inner glow, gold base mount, transparent background, sharp pixel art, side-view",
    guidance: 13,
  },
  {
    file: "star-bullet.png",
    width: 32,
    height: 32,
    prompt: "pixel art gold magical star icon, dark fantasy RPG UI bullet point, glowing gold 4-point star with purple sparkle, transparent background, 32x32 sharp pixel art",
    guidance: 12,
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
      {
        hostname: "api.pixellab.ai",
        path: "/v1/generate-image-pixflux",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      },
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
              resolve();
            } else if (json.image?.url) {
              https.get(json.image.url, (imgRes) => {
                const chunks = [];
                imgRes.on("data", (c) => chunks.push(c));
                imgRes.on("end", () => {
                  const buf = Buffer.concat(chunks);
                  const outPath = path.join(OUT_DIR, file);
                  fs.writeFileSync(outPath, buf);
                  console.log(`  ✓ Saved ${outPath} (${buf.length} bytes)`);
                  resolve();
                });
              });
            } else {
              console.error(`  ✗ Unexpected response for ${file}:`, JSON.stringify(json).slice(0, 200));
              resolve(); // don't fail the whole run
            }
          } catch (e) {
            console.error(`  ✗ Parse error for ${file}:`, e.message);
            resolve();
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Run sequentially to avoid rate limits
for (const el of ELEMENTS) {
  await generate(el);
  await new Promise((r) => setTimeout(r, 1500)); // small gap between requests
}

console.log("\nAll done! Files saved to public/ui/");
