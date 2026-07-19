const https = require("https");
const sharp = require("sharp");
const fs = require("fs");

// Curated Unsplash photo IDs, topical + cohesive
const imgs = {
  cover:    "photo-1451187580459-43490279c0fa", // abstract network / earth tech (dark)
  code:     "photo-1461749280684-dccba630e2f6", // code on screen
  hack:     "photo-1522202176988-66273c2fd55f", // people collaborating laptops
  frame:    "photo-1487958449943-2429e8be8625", // white architecture / framework
  network:  "photo-1639322537228-f710d846310a", // abstract digital / AI
  close:    "photo-1517245386807-bb43f82c33c4", // team working together
};

function dl(id) {
  const url = `https://images.unsplash.com/${id}?w=1800&q=80&auto=format&fit=crop`;
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      if (r.statusCode !== 200) { rej(new Error(id + " -> " + r.statusCode)); return; }
      const chunks = [];
      r.on("data", c => chunks.push(c));
      r.on("end", () => res(Buffer.concat(chunks)));
    }).on("error", rej);
  });
}

(async () => {
  for (const [name, id] of Object.entries(imgs)) {
    try {
      const buf = await dl(id);
      // grayscale + mild contrast for panel use
      await sharp(buf).grayscale().linear(1.08, -8).jpeg({ quality: 85 })
        .toFile(`assets/${name}_bw.jpg`);
      // darkened variant for full-bleed text backgrounds
      await sharp(buf).grayscale().linear(0.5, -10).jpeg({ quality: 85 })
        .toFile(`assets/${name}_dark.jpg`);
      const meta = await sharp(buf).metadata();
      console.log("ok", name, meta.width + "x" + meta.height);
    } catch (e) {
      console.log("FAIL", name, e.message);
    }
  }
})();
