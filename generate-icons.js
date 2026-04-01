const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Icon design: indigo circle, gold star, white maths symbols
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#3730a3"/>
    </radialGradient>
    <radialGradient id="starglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd700" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ffd700" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background circle -->
  <circle cx="256" cy="256" r="256" fill="url(#bg)"/>

  <!-- Outer ring -->
  <circle cx="256" cy="256" r="240" fill="none" stroke="#ffd700" stroke-width="12" stroke-opacity="0.6"/>

  <!-- Star glow -->
  <circle cx="256" cy="226" r="130" fill="url(#starglow)"/>

  <!-- 5-pointed star -->
  <polygon points="
    256,80
    295,180
    405,180
    320,243
    353,345
    256,280
    159,345
    192,243
    107,180
    217,180
  " fill="#ffd700" stroke="#b8860b" stroke-width="6" stroke-linejoin="round"/>

  <!-- Plus sign -->
  <rect x="233" y="188" width="46" height="14" rx="7" fill="#3730a3"/>
  <rect x="249" y="172" width="14" height="46" rx="7" fill="#3730a3"/>

  <!-- Small decorative dots -->
  <circle cx="110" cy="370" r="18" fill="#ffd700" opacity="0.7"/>
  <circle cx="402" cy="370" r="12" fill="#ffd700" opacity="0.5"/>
  <circle cx="80" cy="180" r="10" fill="#a5b4fc" opacity="0.6"/>
  <circle cx="432" cy="180" r="10" fill="#a5b4fc" opacity="0.6"/>

  <!-- "A" for Adventure at bottom -->
  <text x="256" y="430" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="72" font-weight="900" fill="#ffd700" letter-spacing="-2" opacity="0.9">MATHS</text>
</svg>
`;

const svgBuffer = Buffer.from(svg);
const publicDir = path.join(__dirname, "public");

async function generate() {
  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, "logo512.png"));
  console.log("✓ logo512.png");

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, "logo192.png"));
  console.log("✓ logo192.png");

  // 64x64 for favicon (save as png first, then rename)
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, "favicon.png"));
  console.log("✓ favicon.png");

  // Copy favicon.png over favicon.ico (browsers accept PNG named .ico)
  fs.copyFileSync(
    path.join(publicDir, "favicon.png"),
    path.join(publicDir, "favicon.ico")
  );
  fs.unlinkSync(path.join(publicDir, "favicon.png"));
  console.log("✓ favicon.ico");

  console.log("\nAll icons generated!");
}

generate().catch(console.error);
