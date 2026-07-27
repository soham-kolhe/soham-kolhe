// Generates an animated SVG: a plane sweeps each contribution-graph row left to
// right, "shooting" every green (contributed) cell so it disappears, then drops
// to the next row. After the last row it loops back to the top and all cells
// reappear, since the animation is one repeating SMIL cycle.

const USERNAME = process.argv[2] || process.env.GITHUB_USER_NAME;
if (!USERNAME) {
  console.error("Usage: node generate.js <github-username>");
  process.exit(1);
}

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const PAD_LEFT = 20;
const PAD_TOP = 20;
const PAD_RIGHT = 20;
const PAD_BOTTOM = 20;
const ROW_DURATION = 2.0; // seconds per row sweep
const NUM_ROWS = 7;

const COLOR_BG = "#0a0a0a";
const COLOR_EMPTY = "#1a1a24";
const COLOR_BOX = "#B8FF00";
const COLOR_PLANE = "#00F0FF";
const COLOR_LASER = "#FF00AA";

async function main() {
  const res = await fetch(`https://github.com/users/${USERNAME}/contributions`);
  if (!res.ok) throw new Error(`Failed to fetch contribution graph: ${res.status}`);
  const html = await res.text();

  const cellRe = /<td[^>]*data-date="([^"]+)"[^>]*id="contribution-day-component-(\d+)-(\d+)"[^>]*data-level="(\d+)"[^>]*>/g;

  const cells = [];
  let match;
  let maxCol = 0;
  while ((match = cellRe.exec(html)) !== null) {
    const [, date, row, col, level] = match;
    const r = parseInt(row, 10);
    const c = parseInt(col, 10);
    const lvl = parseInt(level, 10);
    if (c > maxCol) maxCol = c;
    cells.push({ date, row: r, col: c, level: lvl });
  }

  if (cells.length === 0) {
    throw new Error("No contribution cells parsed — GitHub's markup may have changed.");
  }

  const numCols = maxCol + 1;
  const width = PAD_LEFT + numCols * STEP + PAD_RIGHT;
  const height = PAD_TOP + NUM_ROWS * STEP + PAD_BOTTOM;
  const totalDuration = NUM_ROWS * ROW_DURATION;

  const xStart = PAD_LEFT + CELL / 2;
  const xEnd = PAD_LEFT + (numCols - 1) * STEP + CELL / 2;

  function colX(c) { return PAD_LEFT + c * STEP; }
  function rowY(r) { return PAD_TOP + r * STEP; }
  function rowCenterY(r) { return rowY(r) + CELL / 2; }

  // --- boxes + bullets ---
  // For each green box: the plane fires a bullet BULLET_TRAVEL seconds before it
  // would reach the box. The bullet is invisible until fire-time, then travels
  // from the plane's position at that instant to the box, arriving exactly when
  // the box disappears — so boxes are hit one bullet at a time, in order.
  const BULLET_TRAVEL = 0.16;
  const rowSpeed = (xEnd - xStart) / ROW_DURATION;

  let boxesSvg = "";
  let bulletsSvg = "";

  for (const cell of cells) {
    if (cell.row >= NUM_ROWS) continue;
    const bx = colX(cell.col);
    const by = rowY(cell.row);

    if (cell.level > 0) {
      const hitFraction = cell.col / (numCols - 1);
      const hitWithinRow = hitFraction * ROW_DURATION;
      const travelDur = Math.min(BULLET_TRAVEL, hitWithinRow);
      const fireWithinRow = hitWithinRow - travelDur;

      const hitAbs = cell.row * ROW_DURATION + hitWithinRow;
      const fireAbs = cell.row * ROW_DURATION + fireWithinRow;

      const hitFrac = Math.min(hitAbs / totalDuration, 0.9999);
      const fireFrac = Math.min(fireAbs / totalDuration, hitFrac - 0.0001);
      const fireEps = Math.min(fireFrac + 0.0004, hitFrac - 0.00005);
      const hitEps = Math.min(hitFrac + 0.0006, 0.9999);

      const boxCx = bx + CELL / 2;
      const planeXAtFire = xStart + rowSpeed * fireWithinRow;
      const bulletY = rowCenterY(cell.row);

      boxesSvg += `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" fill="${COLOR_BOX}">
      <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${hitFrac.toFixed(5)};${hitEps.toFixed(5)};1" dur="${totalDuration}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
    </rect>\n`;

      bulletsSvg += `<rect width="5" height="2.4" rx="1" fill="${COLOR_LASER}" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${fireFrac.toFixed(5)};${fireEps.toFixed(5)};${hitFrac.toFixed(5)};${hitEps.toFixed(5)};1" dur="${totalDuration}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
      <animateTransform attributeName="transform" attributeType="XML" type="translate"
        values="${planeXAtFire.toFixed(2)},${(bulletY - 1.2).toFixed(2)};${planeXAtFire.toFixed(2)},${(bulletY - 1.2).toFixed(2)};${(boxCx - 2.5).toFixed(2)},${(bulletY - 1.2).toFixed(2)}"
        keyTimes="0;${fireFrac.toFixed(5)};${hitFrac.toFixed(5)}"
        dur="${totalDuration}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
    </rect>\n`;
    } else {
      boxesSvg += `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" fill="${COLOR_EMPTY}"/>\n`;
    }
  }

  // --- plane motion ---
  const combinedKeyTimes = [];
  const combinedValues = [];
  for (let r = 0; r < NUM_ROWS; r++) {
    const t0 = r / NUM_ROWS;
    const t1 = (r + 1) / NUM_ROWS;
    const y = rowCenterY(r);
    combinedKeyTimes.push(t0.toFixed(6));
    combinedValues.push(`${xStart.toFixed(2)},${y.toFixed(2)}`);
    combinedKeyTimes.push(t1.toFixed(6));
    combinedValues.push(`${xEnd.toFixed(2)},${y.toFixed(2)}`);
  }

  // Pixel-art jet, nose pointing right: body, cockpit, wings, tail fin, engine glow.
  const planeShape = `
    <rect x="-11" y="-1.5" width="18" height="3" fill="${COLOR_PLANE}"/>
    <rect x="4" y="-1" width="7" height="2" fill="${COLOR_PLANE}"/>
    <rect x="-3" y="-5" width="6" height="3" fill="${COLOR_PLANE}"/>
    <rect x="-3" y="2" width="6" height="3" fill="${COLOR_PLANE}"/>
    <rect x="-9" y="-3.5" width="4" height="1.5" fill="${COLOR_PLANE}"/>
    <rect x="-9" y="2" width="4" height="1.5" fill="${COLOR_PLANE}"/>
    <rect x="1" y="-1.5" width="2.5" height="3" fill="${COLOR_LASER}" opacity="0.9"/>
    <rect x="-14" y="-1" width="3" height="2" fill="${COLOR_PLANE}" opacity="0.5"/>
  `;

  const planeGroup = `
  <g>
    ${planeShape}
    <animateTransform attributeName="transform" attributeType="XML" type="translate"
      values="${combinedValues.join(";")}"
      keyTimes="${combinedKeyTimes.join(";")}"
      calcMode="linear"
      dur="${totalDuration}s" repeatCount="indefinite"/>
  </g>`;

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${COLOR_BG}" rx="6"/>
  ${boxesSvg}
  ${bulletsSvg}
  ${planeGroup}
</svg>`;

  require("fs").writeFileSync(process.env.OUTPUT_FILE || "row-sweep-invaders.svg", svg);
  const contributedCount = cells.filter((c) => c.level > 0).length;
  console.log(`Wrote SVG: ${width}x${height}, ${cells.length} cells parsed, ${contributedCount} contributed cells, duration ${totalDuration}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
