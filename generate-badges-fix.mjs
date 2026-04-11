import fs from "fs";
import path from "path";
import https from "https";

const API_KEY = process.argv[2];
if (!API_KEY) { console.error("Usage: node generate-badges-fix.mjs YOUR_API_KEY"); process.exit(1); }

const OUT_DIR = "./public/badges";

const BADGES = [
  {
    file: "streak30.png",
    desc: "pixel art badge icon, crescent moon glowing over a dark castle, 30 days, lunar calendar, dark fantasy RPG style, gold border frame, transparent background, 64x64",
  },
  {
    file: "all_master.png",
    desc: "pixel art legendary badge, radiant golden crown with jewels floating above rays of light, maths champion ultimate award, majestic regal, dark fantasy RPG style, transparent background, 64x64",
  },
  {
    file: "q2500.png",
    desc: "pixel art badge icon, dark blue ancient tome book with runes and 2500 on the cover, glowing magical text, dark fantasy RPG style, gold border, transparent background, 64x64",
  },
  {
    file: "halfway.png",
    desc: "pixel art badge icon, dark shield split exactly in half, left side glowing gold filled, right side dark empty, journey halfway milestone, dark fantasy RPG style, transparent background, 64x64",
  },
  {
    file: "speed_legend.png",
    desc: "pixel art legendary badge, dark wizard on a broomstick trailing fire leaving speed lines, legendary speed award, dark fantasy RPG style, gold frame, transparent background, 64x64",
  },
];

async function generate({ file, desc }) {
  const outPath = path.join(OUT_DIR, file);
  process.stdout.write(`Regenerating ${file}… `);
  const body = JSON.stringify({
    description: desc,
    image_size: { width: 64, height: 64 },
    no_background: true,
    text_guidance_scale: 14,
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

for (const badge of BADGES) {
  await generate(badge);
  await new Promise(r => setTimeout(r, 1200));
}
console.log("Done!");
