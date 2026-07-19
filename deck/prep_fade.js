const sharp = require("sharp");

// target panel pixel size (ratio matches 6.9in x 7.5in placement)
const TW = 1380, TH = 1500;

function maskSvg(side){
  // side 'left' => fade on the left edge (transparent -> opaque)
  const stops = side === "left"
    ? `<stop offset="0" stop-color="#fff" stop-opacity="0"/>
       <stop offset="0.42" stop-color="#fff" stop-opacity="1"/>
       <stop offset="1" stop-color="#fff" stop-opacity="1"/>`
    : `<stop offset="0" stop-color="#fff" stop-opacity="1"/>
       <stop offset="0.58" stop-color="#fff" stop-opacity="1"/>
       <stop offset="1" stop-color="#fff" stop-opacity="0"/>`;
  return Buffer.from(
    `<svg width="${TW}" height="${TH}" xmlns="http://www.w3.org/2000/svg">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`);
}

async function fade(src, out, side){
  const base = await sharp(`assets/${src}`)
    .resize(TW, TH, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .toBuffer();
  await sharp(base)
    .composite([{ input: maskSvg(side), blend: "dest-in" }])
    .png()
    .toFile(`assets/${out}`);
  console.log("faded", out);
}

(async () => {
  await fade("code_bw.jpg",  "code_fade.png",  "left");
  await fade("hack_bw.jpg",  "hack_fade.png",  "left");
  await fade("frame_bw.jpg", "frame_fade.png", "left");
})();
