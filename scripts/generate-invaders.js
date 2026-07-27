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

  // Each day cell looks like:
  // <td ... data-date="2025-07-27" id="contribution-day-component-0-0" data-level="0" ...>
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

  function colX(c) {
    return PAD_LEFT + c * STEP;
  }
  function rowY(r) {
    return PAD_TOP + r * STEP;
  }
  function rowCenterY(r) {
    return rowY(r) + CELL / 2;
  }

  // --- boxes ---
  let boxesSvg = "";
  const laserPulses = [];

  for (const cell of cells) {
    if (cell.row >= NUM_ROWS) continue; // safety
    if (cell.level > 0) {
      const hitFraction = cell.col / (numCols - 1);
      const hitTimeAbs = cell.row * ROW_DURATION + hitFraction * ROW_DURATION + 0.05;
      const hitFrac = Math.min(hitTimeAbs / totalDuration, 0.9999);
      const epsFrac = Math.min(hitFrac + 0.0006, 0.9999);

      const bx = colX(cell.col);
      const by = rowY(cell.row);

      boxesSvg += `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" fill="${COLOR_BOX}">
      <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${hitFrac.toFixed(5)};${epsFrac.toFixed(5)};1" dur="${totalDuration}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
    </rect>\n`;

      laserPulses.push({ cx: bx + CELL / 2, cy: by + CELL / 2, hitFrac });
    } else {
      const bx = colX(cell.col);
      const by = rowY(cell.row);
      boxesSvg += `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" fill="${COLOR_EMPTY}"/>\n`;
    }
  }

  // --- laser flash dots at hit moments ---
  let laserSvg = "";
  for (const p of laserPulses) {
    const start = Math.max(p.hitFrac - 0.0015, 0);
    const end = Math.min(p.hitFrac + 0.006, 1);
    laserSvg += `<circle cx="${p.cx.toFixed(2)}" cy="${p.cy.toFixed(2)}" r="5" fill="${COLOR_LASER}" opacity="0">
      <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${start.toFixed(5)};${p.hitFrac.toFixed(5)};${end.toFixed(5)};1" dur="${totalDuration}s" begin="0s" repeatCount="indefinite" fill="freeze"/>
    </circle>\n`;
  }

  // --- plane motion: x sweeps each row, y steps down each row ---
  // A single animateTransform (translate) driven by combined "x,y" value pairs per
  // row segment gives a clean left-to-right sweep with an instant vertical drop
  // between rows.
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

  const planeGroup = `
  <g>
    <path d="M -9,-6 L 9,0 L -9,6 L -4,0 Z" fill="${COLOR_PLANE}" stroke="${COLOR_PLANE}" stroke-width="0.5">
      <animateTransform attributeName="transform" attributeType="XML" type="translate"
        values="${combinedValues.join(";")}"
        keyTimes="${combinedKeyTimes.join(";")}"
        calcMode="linear"
        dur="${totalDuration}s" repeatCount="indefinite"/>
    </path>
  </g>`;

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${COLOR_BG}" rx="6"/>
  ${boxesSvg}
  ${laserSvg}
  ${planeGroup}
</svg>`;

  require("fs").writeFileSync(process.env.OUTPUT_FILE || "row-sweep-invaders.svg", svg);
  console.log(`Wrote SVG: ${width}x${height}, ${cells.length} cells parsed, ${laserPulses.length} contributed cells, duration ${totalDuration}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
