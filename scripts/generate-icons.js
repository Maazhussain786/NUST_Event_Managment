const sharp = require('sharp');
const fs = require('fs');

async function generate() {
  const svg192 = fs.readFileSync('public/icons/icon-192.svg');
  const svg512 = fs.readFileSync('public/icons/icon-512.svg');

  await sharp(svg192).resize(192, 192).png().toFile('public/icons/icon-192.png');
  await sharp(svg512).resize(512, 512).png().toFile('public/icons/icon-512.png');

  // Maskable icon with safe-area padding (solid background, no rounded corners)
  const maskSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
    '<rect width="512" height="512" fill="#f97316"/>' +
    '<text x="256" y="290" font-family="system-ui, sans-serif" font-size="220" font-weight="bold" fill="white" text-anchor="middle">N</text>' +
    '<text x="256" y="380" font-family="system-ui, sans-serif" font-size="60" fill="rgba(255,255,255,0.85)" text-anchor="middle">Events</text>' +
    '</svg>'
  );

  await sharp(maskSvg).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
  await sharp(maskSvg).resize(192, 192).png().toFile('public/icons/icon-maskable-192.png');

  // Apple touch icon (180x180)
  await sharp(svg512).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');

  console.log('All icons generated successfully');
}

generate().catch(console.error);
