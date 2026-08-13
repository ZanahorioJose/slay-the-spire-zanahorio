const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await page.goto("file:///Users/zanahoriojose/Developers/Git/slay-the-spire-zanahorio/docs/art-card-material.html");
  await page.waitForTimeout(1500);

  const report = await page.evaluate(() => {
    const win = document.getElementById("heroArtWin");
    const cv = win.querySelector("canvas");
    const painted = cv
      ? (() => {
          const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
          return n > 0;
        })()
      : false;
    const foilAnim = getComputedStyle(document.querySelector(".hero-row .mat-frame"), "::before").animationName;
    return {
      title: document.title,
      heroCanvasPainted: painted,
      heroArtChildren: win.children.length,
      heroFoilAnimating: foilAnim === "foil-rotate",
      stressCards: document.getElementById("grid").children.length,
    };
  });

  await page.click('[data-count="120"]');
  await page.click('[data-mode="foil"]');
  await page.waitForTimeout(1500);
  const stress = await page.evaluate(() => ({
    count: document.getElementById("grid").children.length,
    allFoil: document.querySelectorAll(".grid .card").length === 120 &&
      document.querySelectorAll(".grid .mat-foil").length === 120,
  }));

  console.log(JSON.stringify({ errors, report, stress }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("QA FAIL:", e.message);
  process.exit(1);
});
