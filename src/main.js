const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  toolGrid: document.getElementById("tool-grid"),
  funds: document.getElementById("funds-label"),
  month: document.getElementById("month-label"),
  population: document.getElementById("population-label"),
  happiness: document.getElementById("happiness-label"),
  cashflow: document.getElementById("cashflow-label"),
  demandRes: document.getElementById("demand-res"),
  demandCom: document.getElementById("demand-com"),
  demandInd: document.getElementById("demand-ind"),
  tileCoords: document.getElementById("tile-coords"),
  tileDetails: document.getElementById("tile-details"),
  citizenList: document.getElementById("citizen-list"),
  eventLog: document.getElementById("event-log"),
  selectedTool: document.getElementById("selected-tool-label"),
  statusLine: document.getElementById("status-line"),
  employment: document.getElementById("employment-label"),
  pauseButton: document.getElementById("pause-button"),
  speedButton: document.getElementById("speed-button"),
  overlayButtons: [...document.querySelectorAll("[data-overlay]")],
};

const TILE_W = 64;
const TILE_H = 32;
const GRID_W = 18;
const GRID_H = 18;
const SIM_TICK_SECONDS = 1.1;
const MAX_LOGS = 6;
const MAX_EVENTS = 16;

const TOOL_DEFS = [
  {
    id: "road",
    label: "Road",
    description: "$25",
    cost: 25,
    color: "#5f6168",
    type: "infrastructure",
    tip: "Roads give every zone access. Run them close to every block.",
  },
  {
    id: "residential",
    label: "Residential",
    description: "$140",
    cost: 140,
    color: "#7ab86d",
    type: "zone",
    tip: "Homes want roads, water, power, and a little distance from industry.",
  },
  {
    id: "commercial",
    label: "Commercial",
    description: "$170",
    cost: 170,
    color: "#6bc8df",
    type: "zone",
    tip: "Shops thrive near roads and nearby residents with money to spend.",
  },
  {
    id: "industrial",
    label: "Industrial",
    description: "$190",
    cost: 190,
    color: "#e39f52",
    type: "zone",
    tip: "Industry creates jobs but drags down nearby land value.",
  },
  {
    id: "park",
    label: "Park",
    description: "$90",
    cost: 90,
    color: "#3d8d63",
    type: "infrastructure",
    tip: "Parks boost nearby happiness and help zones level up.",
  },
  {
    id: "power",
    label: "Power Plant",
    description: "$850",
    cost: 850,
    color: "#d96f4d",
    type: "utility",
    tip: "Power plants energize a large chunk of the map. One goes a long way.",
  },
  {
    id: "water",
    label: "Water Tower",
    description: "$620",
    cost: 620,
    color: "#4d7fd9",
    type: "utility",
    tip: "Water towers serve a medium radius. Homes without water stall fast.",
  },
  {
    id: "bulldozer",
    label: "Bulldozer",
    description: "Free",
    cost: 0,
    color: "#cc5050",
    type: "action",
    tip: "Clear a tile and recover part of the land cost.",
  },
];

const TOOL_MAP = Object.fromEntries(TOOL_DEFS.map((tool) => [tool.id, tool]));

const NAMES = [
  "Mina",
  "Gus",
  "June",
  "Otto",
  "Nadia",
  "Iris",
  "Leo",
  "Mae",
  "Quinn",
  "Rafi",
  "Pia",
  "Theo",
  "Ada",
  "Sol",
  "Vera",
  "Nico",
];

const SURNAME_PARTS = [
  "Wick",
  "Stone",
  "Vale",
  "Grove",
  "Moss",
  "Briar",
  "Marsh",
  "Pond",
  "Knox",
  "Bloom",
];

const state = {
  selectedTool: "residential",
  overlayMode: "issues",
  funds: 16000,
  cashflow: 0,
  month: 1,
  paused: false,
  speed: 1,
  tickAccumulator: 0,
  lastFrame: performance.now(),
  dragPainting: false,
  lastPaintKey: "",
  hovered: null,
  households: [],
  businesses: [],
  stats: {
    population: 0,
    happiness: 0,
    employmentRate: 0,
    jobs: 0,
    filledJobs: 0,
  },
  demand: {
    residential: 2,
    commercial: 1,
    industrial: 1,
  },
  eventHistory: [],
  logs: [
    {
      title: "Founding charter",
      body: "A blank patch of land and a budget. Put down roads before zoning.",
    },
    {
      title: "Simulation hint",
      body: "Coverage icons show missing road, water, or power on problem tiles.",
    },
  ],
  camera: {
    x: 0,
    y: 72,
    zoom: 1,
  },
  grid: [],
};

function createCell(x, y) {
  return {
    x,
    y,
    kind: "empty",
    level: 0,
    progress: 0,
    roadAccess: false,
    power: false,
    water: false,
    landValue: 40,
    desirability: 40,
    abandoned: false,
    residents: 0,
    jobs: 0,
    filledJobs: 0,
    households: [],
    variant: hash(x, y, 11) % 4,
    terrain: 36 + (hash(x, y, 97) % 18),
    issues: [],
  };
}

function buildInitialGrid() {
  state.grid = Array.from({ length: GRID_H }, (_, y) =>
    Array.from({ length: GRID_W }, (_, x) => createCell(x, y)),
  );
}

function hash(a, b, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return Math.abs(Math.floor(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getCell(x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) {
    return null;
  }
  return state.grid[y][x];
}

function neighbors4(cell) {
  return [
    getCell(cell.x + 1, cell.y),
    getCell(cell.x - 1, cell.y),
    getCell(cell.x, cell.y + 1),
    getCell(cell.x, cell.y - 1),
  ].filter(Boolean);
}

function forEachCell(callback) {
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      callback(state.grid[y][x], x, y);
    }
  }
}

function countNearbyKinds(x, y, radius, kind) {
  let total = 0;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(GRID_H - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(GRID_W - 1, x + radius); xx += 1) {
      const distance = Math.abs(xx - x) + Math.abs(yy - y);
      if (distance > radius) {
        continue;
      }
      if (getCell(xx, yy)?.kind === kind) {
        total += 1;
      }
    }
  }
  return total;
}

function distanceToNearestKind(x, y, kind, limit = 99) {
  let best = limit;
  forEachCell((cell) => {
    if (cell.kind !== kind) {
      return;
    }
    const distance = Math.abs(cell.x - x) + Math.abs(cell.y - y);
    if (distance < best) {
      best = distance;
    }
  });
  return best;
}

function gridToScreen(x, y) {
  const worldX = (x - y) * (TILE_W / 2);
  const worldY = (x + y) * (TILE_H / 2);
  return {
    x: canvas.width / 2 + state.camera.x + worldX * state.camera.zoom,
    y: 120 + state.camera.y + worldY * state.camera.zoom,
  };
}

function screenToGrid(screenX, screenY) {
  const localX = (screenX - canvas.width / 2 - state.camera.x) / state.camera.zoom;
  const localY = (screenY - 120 - state.camera.y) / state.camera.zoom;
  const gridX = Math.floor((localY / (TILE_H / 2) + localX / (TILE_W / 2)) / 2);
  const gridY = Math.floor((localY / (TILE_H / 2) - localX / (TILE_W / 2)) / 2);
  return { x: gridX, y: gridY };
}

function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

function toolById(id) {
  return TOOL_MAP[id];
}

function placeToolAt(cell, toolId) {
  if (!cell) {
    return;
  }

  if (toolId === "bulldozer") {
    bulldoze(cell);
    return;
  }

  const tool = toolById(toolId);
  if (!tool || state.funds < tool.cost) {
    if (tool && state.funds < tool.cost) {
      pushLog("Budget warning", `You need ${formatMoney(tool.cost)} for ${tool.label}.`);
    }
    return;
  }

  if (cell.kind === toolId) {
    return;
  }

  const previousCost = cell.kind !== "empty" ? Math.floor((toolById(cell.kind)?.cost || 0) * 0.25) : 0;
  state.funds += previousCost;
  state.funds -= tool.cost;

  cell.kind = toolId;
  cell.level = 0;
  cell.progress = 0;
  cell.abandoned = false;
  cell.residents = 0;
  cell.jobs = 0;
  cell.filledJobs = 0;
  cell.households = [];
  cell.variant = hash(cell.x, cell.y, state.month + tool.cost) % 4;
  refreshStatus(tool.tip);
  simulateStep(false);
}

function bulldoze(cell) {
  if (!cell || cell.kind === "empty") {
    return;
  }
  const refund = Math.floor((toolById(cell.kind)?.cost || 0) * 0.35);
  state.funds += refund;
  state.grid[cell.y][cell.x] = createCell(cell.x, cell.y);
  refreshStatus(`Cleared tile for ${formatMoney(refund)} in salvage.`);
  simulateStep(false);
}

function formatMoney(value) {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString()}`;
}

function isZone(cell) {
  return (
    cell.kind === "residential" ||
    cell.kind === "commercial" ||
    cell.kind === "industrial"
  );
}

function isUtility(cell) {
  return cell.kind === "power" || cell.kind === "water";
}

function updateCoverage() {
  forEachCell((cell) => {
    cell.roadAccess = false;
    cell.power = false;
    cell.water = false;
    cell.issues = [];
  });

  forEachCell((cell) => {
    if (cell.kind === "road") {
      cell.roadAccess = true;
      return;
    }

    if (isZone(cell) || isUtility(cell) || cell.kind === "park") {
      cell.roadAccess = neighbors4(cell).some((neighbor) => neighbor.kind === "road");
    }
  });

  forEachCell((cell) => {
    if (cell.kind !== "power") {
      return;
    }
    for (let yy = Math.max(0, cell.y - 6); yy <= Math.min(GRID_H - 1, cell.y + 6); yy += 1) {
      for (let xx = Math.max(0, cell.x - 6); xx <= Math.min(GRID_W - 1, cell.x + 6); xx += 1) {
        const target = getCell(xx, yy);
        if (!target) {
          continue;
        }
        if (Math.abs(xx - cell.x) + Math.abs(yy - cell.y) <= 6) {
          target.power = true;
        }
      }
    }
  });

  forEachCell((cell) => {
    if (cell.kind !== "water") {
      return;
    }
    for (let yy = Math.max(0, cell.y - 5); yy <= Math.min(GRID_H - 1, cell.y + 5); yy += 1) {
      for (let xx = Math.max(0, cell.x - 5); xx <= Math.min(GRID_W - 1, cell.x + 5); xx += 1) {
        const target = getCell(xx, yy);
        if (!target) {
          continue;
        }
        if (Math.abs(xx - cell.x) + Math.abs(yy - cell.y) <= 5) {
          target.water = true;
        }
      }
    }
  });
}

function updateLandValue() {
  forEachCell((cell) => {
    const parks = countNearbyKinds(cell.x, cell.y, 2, "park");
    const industry = countNearbyKinds(cell.x, cell.y, 2, "industrial");
    const commerce = countNearbyKinds(cell.x, cell.y, 2, "commercial");
    const roadDistance = distanceToNearestKind(cell.x, cell.y, "road", 8);
    const utilityBonus = Number(cell.power) * 8 + Number(cell.water) * 7;
    const roadBonus = roadDistance < 5 ? 12 - roadDistance * 2 : -10;
    const base = 32 + cell.terrain + parks * 10 + commerce * 2 + utilityBonus + roadBonus - industry * 13;
    cell.landValue = clamp(base, 0, 100);

    let desirability = cell.landValue;
    if (cell.kind === "industrial") {
      desirability = clamp(48 + roadBonus + utilityBonus + commerce * 4, 0, 100);
    } else if (cell.kind === "commercial") {
      desirability = clamp(cell.landValue + commerce * 3 + parks * 2, 0, 100);
    } else if (cell.kind === "residential") {
      desirability = clamp(cell.landValue + parks * 5 - industry * 4, 0, 100);
    }
    cell.desirability = desirability;
  });
}

function computeDemand() {
  const housingCapacity = state.households.length;
  const population = state.stats.population;
  const openJobs = Math.max(0, state.stats.jobs - state.stats.filledJobs);
  const residential = clamp(
    Math.round((openJobs - housingCapacity * 0.6) / 3 + (state.stats.happiness - 52) / 8),
    -6,
    8,
  );
  const commercial = clamp(
    Math.round((population / 10 - countKind("commercial") * 1.8) + state.stats.happiness / 30),
    -6,
    8,
  );
  const industrial = clamp(
    Math.round((population / 16 - countKind("industrial") * 1.3) + countKind("power") * 1.5),
    -6,
    8,
  );
  state.demand.residential = residential;
  state.demand.commercial = commercial;
  state.demand.industrial = industrial;
}

function countKind(kind) {
  let count = 0;
  forEachCell((cell) => {
    if (cell.kind === kind) {
      count += 1;
    }
  });
  return count;
}

function evolveZones() {
  forEachCell((cell) => {
    if (!isZone(cell)) {
      return;
    }

    const demandValue = state.demand[cell.kind];
    const serviceScore = Number(cell.roadAccess) + Number(cell.power) + Number(cell.water);
    const fullyServiced = serviceScore === 3;
    const favorable = fullyServiced ? cell.desirability / 16 + demandValue + serviceScore * 0.7 : 0;
    const unfavorable =
      Number(!cell.roadAccess) * 3.2 +
      Number(!cell.power) * 3.6 +
      Number(!cell.water) * 3.3 +
      Number(cell.desirability < 32) * 1.3 +
      Number(demandValue < -2) * 1.4 +
      Number(!fullyServiced) * 2.6;

    cell.progress += favorable - unfavorable;

    if (cell.progress > 8 && cell.level < 3) {
      cell.level += 1;
      cell.progress = 0;
      cell.abandoned = false;
      pushLog("Development", `${labelForKind(cell.kind)} upgraded at block ${cell.x},${cell.y}.`);
    }

    if (cell.progress < -10) {
      if (cell.level > 0) {
        cell.level -= 1;
        cell.progress = -1;
      } else {
        cell.abandoned = true;
      }
    }

    if (serviceScore < 2) {
      cell.abandoned = cell.level > 0 && cell.progress < -3;
    }

    if (fullyServiced && cell.level === 0 && cell.progress > 3) {
      cell.level = 1;
      cell.progress = 0;
      cell.abandoned = false;
    }

    if (cell.abandoned) {
      cell.level = Math.max(0, cell.level - 1);
      cell.progress = -3;
    }
  });
}

function rebuildPopulationSample() {
  const businesses = [];
  const households = [];

  forEachCell((cell) => {
    cell.residents = 0;
    cell.jobs = 0;
    cell.filledJobs = 0;
    cell.households = [];

    if (!isZone(cell) || cell.level === 0 || cell.abandoned) {
      return;
    }

    if (cell.kind === "residential") {
      const householdCount = clamp(cell.level + Math.floor(cell.desirability / 30), 1, 5);
      for (let index = 0; index < householdCount; index += 1) {
        const size = 1 + (hash(cell.x, cell.y, index) % 4);
        const resident = {
          id: `${cell.x}-${cell.y}-${index}`,
          name: `${NAMES[hash(cell.x, cell.y, index) % NAMES.length]} ${
            SURNAME_PARTS[hash(cell.x, cell.y, index + 20) % SURNAME_PARTS.length]
          }`,
          size,
          homeX: cell.x,
          homeY: cell.y,
          homeLevel: cell.level,
          employed: false,
          workKind: null,
          workX: null,
          workY: null,
          mood: 50,
          note: "Settling in",
        };
        households.push(resident);
        cell.households.push(resident);
        cell.residents += size;
      }
    }

    if (cell.kind === "commercial" || cell.kind === "industrial") {
      const baseJobs = cell.kind === "commercial" ? 4 : 6;
      const jobs = baseJobs * cell.level + Math.floor(cell.desirability / 25);
      cell.jobs = jobs;
      businesses.push({
        kind: cell.kind,
        x: cell.x,
        y: cell.y,
        openJobs: jobs,
        filledJobs: 0,
      });
    }
  });

  households.sort((a, b) => {
    const aIndustrial = distanceToNearestKind(a.homeX, a.homeY, "industrial", 12);
    const bIndustrial = distanceToNearestKind(b.homeX, b.homeY, "industrial", 12);
    return aIndustrial - bIndustrial;
  });

  for (const household of households) {
    const business = businesses
      .filter((entry) => entry.openJobs > 0)
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - household.homeX) + Math.abs(left.y - household.homeY);
        const rightDistance = Math.abs(right.x - household.homeX) + Math.abs(right.y - household.homeY);
        return leftDistance - rightDistance;
      })[0];

    if (business) {
      household.employed = true;
      household.workKind = business.kind;
      household.workX = business.x;
      household.workY = business.y;
      business.openJobs -= 1;
      business.filledJobs += 1;
      const businessCell = getCell(business.x, business.y);
      if (businessCell) {
        businessCell.filledJobs += 1;
      }
    }

    const homeCell = getCell(household.homeX, household.homeY);
    const parkBonus = countNearbyKinds(household.homeX, household.homeY, 2, "park");
    const industryPenalty = countNearbyKinds(household.homeX, household.homeY, 2, "industrial");
    const serviceBonus =
      Number(homeCell?.roadAccess) * 6 + Number(homeCell?.power) * 6 + Number(homeCell?.water) * 6;
    household.mood = clamp(
      34 +
        (homeCell?.desirability || 40) * 0.5 +
        parkBonus * 5 -
        industryPenalty * 7 +
        Number(household.employed) * 10 +
        serviceBonus,
      0,
      100,
    );
    household.note = household.employed
      ? `Commutes to ${labelForKind(household.workKind)} at ${household.workX},${household.workY}.`
      : "Looking for work and watching the zoning board.";
  }

  state.businesses = businesses;
  state.households = households;
}

function recomputeStats() {
  let population = 0;
  let moodTotal = 0;
  let employed = 0;
  let jobs = 0;
  let filledJobs = 0;

  for (const household of state.households) {
    population += household.size;
    moodTotal += household.mood;
    employed += Number(household.employed);
  }

  for (const business of state.businesses) {
    jobs += business.openJobs + business.filledJobs;
    filledJobs += business.filledJobs;
  }

  state.stats.population = population;
  state.stats.happiness = state.households.length
    ? Math.round(moodTotal / state.households.length)
    : 52;
  state.stats.employmentRate = state.households.length
    ? Math.round((employed / state.households.length) * 100)
    : 0;
  state.stats.jobs = jobs;
  state.stats.filledJobs = filledJobs;
}

function applyEconomy() {
  const revenue =
    state.stats.population * 1.4 +
    state.stats.filledJobs * 0.8 +
    countKind("commercial") * 14 +
    countKind("industrial") * 16;
  const expenses =
    countKind("road") * 1.8 +
    countKind("park") * 4 +
    countKind("power") * 28 +
    countKind("water") * 18;
  state.cashflow = Math.round(revenue - expenses);
  state.funds += state.cashflow;
}

function updateIssues() {
  forEachCell((cell) => {
    const issues = [];
    if (isZone(cell) || isUtility(cell) || cell.kind === "park") {
      if (!cell.roadAccess) {
        issues.push("road");
      }
    }
    if (isZone(cell) || cell.kind === "park") {
      if (!cell.power) {
        issues.push("power");
      }
      if (!cell.water) {
        issues.push("water");
      }
    }
    if (cell.abandoned) {
      issues.push("abandon");
    }
    if (cell.kind === "residential" && cell.desirability < 35) {
      issues.push("sad");
    }
    cell.issues = issues;
  });
}

function pushLog(title, body) {
  const dedupeKey = `${title}:${body}`;
  if (state.eventHistory.includes(dedupeKey)) {
    return;
  }
  state.eventHistory.push(dedupeKey);
  if (state.eventHistory.length > MAX_EVENTS) {
    state.eventHistory.shift();
  }
  state.logs.unshift({ title, body });
  if (state.logs.length > MAX_LOGS) {
    state.logs.pop();
  }
}

function updateMilestones() {
  const population = state.stats.population;
  const happiness = state.stats.happiness;
  if (population >= 25 && !state.eventHistory.includes("milestone:village")) {
    pushLog("Village formed", "Your borough finally has enough people to sustain proper demand.");
    state.eventHistory.push("milestone:village");
  }
  if (population >= 80 && !state.eventHistory.includes("milestone:district")) {
    pushLog("District chartered", "Density is climbing. Keep industry from choking the homes.");
    state.eventHistory.push("milestone:district");
  }
  if (happiness < 45 && !state.eventHistory.includes(`warning:${state.month}`)) {
    pushLog("Citizen complaints", "Residents are grumbling. Add parks or improve service coverage.");
    state.eventHistory.push(`warning:${state.month}`);
  }
}

function simulateStep(advanceTime = true) {
  if (advanceTime) {
    state.month += 1;
  }
  updateCoverage();
  updateLandValue();
  rebuildPopulationSample();
  recomputeStats();
  computeDemand();
  evolveZones();
  rebuildPopulationSample();
  recomputeStats();
  applyEconomy();
  updateIssues();
  updateMilestones();
  renderUI();
}

function refreshStatus(message) {
  ui.statusLine.textContent = message;
}

function labelForKind(kind) {
  return toolById(kind)?.label || "Empty";
}

function renderUI() {
  ui.funds.textContent = formatMoney(state.funds);
  ui.month.textContent = state.month;
  ui.population.textContent = state.stats.population.toLocaleString();
  ui.happiness.textContent = `${state.stats.happiness}%`;
  ui.cashflow.textContent = `${formatMoney(state.cashflow)} / mo`;
  ui.demandRes.textContent = demandArrow(state.demand.residential);
  ui.demandCom.textContent = demandArrow(state.demand.commercial);
  ui.demandInd.textContent = demandArrow(state.demand.industrial);
  ui.selectedTool.textContent = toolById(state.selectedTool)?.label || "Bulldozer";
  ui.employment.textContent = `${state.stats.employmentRate}% employed`;
  renderTileInspector();
  renderCitizens();
  renderLogs();
  renderToolButtons();
  for (const button of ui.overlayButtons) {
    button.classList.toggle("active", button.dataset.overlay === state.overlayMode);
  }
  ui.pauseButton.classList.toggle("active", state.paused);
  ui.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  ui.speedButton.textContent = `${state.speed === 1 ? "2x" : "1x"}`;
}

function demandArrow(value) {
  if (value >= 3) {
    return `▲ ${value}`;
  }
  if (value <= -2) {
    return `▼ ${Math.abs(value)}`;
  }
  return `■ ${value}`;
}

function renderCitizens() {
  const sample = [...state.households]
    .sort((a, b) => b.mood - a.mood)
    .slice(0, 4);
  if (!sample.length) {
    ui.citizenList.innerHTML = '<div class="citizen-card"><strong>No households yet</strong><p>Zone homes and provide services to attract your first residents.</p></div>';
    return;
  }
  ui.citizenList.innerHTML = sample
    .map(
      (citizen) => `
        <div class="citizen-card">
          <strong>${citizen.name}</strong>
          <p>${citizen.size} residents at block ${citizen.homeX},${citizen.homeY}. Mood ${citizen.mood}%.</p>
          <p>${citizen.note}</p>
        </div>
      `,
    )
    .join("");
}

function renderLogs() {
  ui.eventLog.innerHTML = state.logs
    .map(
      (entry) => `
        <div class="event-card">
          <strong>${entry.title}</strong>
          <p>${entry.body}</p>
        </div>
      `,
    )
    .join("");
}

function renderTileInspector() {
  const hovered = state.hovered;
  if (!hovered) {
    ui.tileCoords.textContent = "x0 y0";
    ui.tileDetails.innerHTML = '<div class="detail-chip"><strong>No tile</strong><p>Move the cursor over the map to inspect a block.</p></div>';
    return;
  }

  ui.tileCoords.textContent = `x${hovered.x} y${hovered.y}`;
  const cell = getCell(hovered.x, hovered.y);
  if (!cell) {
    ui.tileDetails.innerHTML = '<div class="detail-chip"><strong>Out of bounds</strong><p>The cursor is outside the buildable borough.</p></div>';
    return;
  }

  const chips = [
    `<div class="detail-chip"><strong>${labelForKind(cell.kind)}</strong><p>Level ${cell.level} · Land ${Math.round(
      cell.landValue,
    )} · Desire ${Math.round(cell.desirability)}</p></div>`,
    `<div class="detail-chip"><strong>Services</strong><p>Road ${
      cell.roadAccess ? "yes" : "no"
    } · Power ${cell.power ? "yes" : "no"} · Water ${cell.water ? "yes" : "no"}</p></div>`,
  ];

  if (isZone(cell)) {
    chips.push(
      `<div class="detail-chip"><strong>Activity</strong><p>${cell.residents} residents · ${cell.filledJobs}/${cell.jobs} jobs · ${
        cell.abandoned ? "Abandoned" : "Active"
      }</p></div>`,
    );
  }

  if (cell.issues.length) {
    chips.push(
      `<div class="detail-chip"><strong>Overlays</strong><p>${cell.issues
        .map((issue) => issue.toUpperCase())
        .join(" · ")}</p></div>`,
    );
  }

  ui.tileDetails.innerHTML = chips.join("");
}

function renderToolButtons() {
  if (ui.toolGrid.dataset.ready === "true") {
    for (const button of ui.toolGrid.querySelectorAll(".tool-button")) {
      button.classList.toggle("active", button.dataset.tool === state.selectedTool);
    }
    return;
  }

  ui.toolGrid.innerHTML = TOOL_DEFS.map(
    (tool) => `
      <button type="button" class="tool-button ${tool.id === state.selectedTool ? "active" : ""}" data-tool="${tool.id}">
        <span class="swatch" style="background:${tool.color}"></span>
        <span>
          <strong>${tool.label}</strong>
          <span>${tool.description}</span>
        </span>
      </button>
    `,
  ).join("");
  ui.toolGrid.dataset.ready = "true";

  for (const button of ui.toolGrid.querySelectorAll(".tool-button")) {
    button.addEventListener("click", () => {
      state.selectedTool = button.dataset.tool;
      refreshStatus(toolById(state.selectedTool).tip);
      renderUI();
    });
  }
}

function drawDiamond(x, y, fill, outline, scale = 1) {
  const halfW = (TILE_W / 2) * scale;
  const halfH = (TILE_H / 2) * scale;
  ctx.beginPath();
  ctx.moveTo(x, y - halfH);
  ctx.lineTo(x + halfW, y);
  ctx.lineTo(x, y + halfH);
  ctx.lineTo(x - halfW, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, scale);
  ctx.stroke();
}

function drawIsoBlock(x, y, width, height, colors) {
  const halfW = width / 2;
  const halfH = width / 4;
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(x, y - height);
  ctx.lineTo(x + halfW, y - height + halfH);
  ctx.lineTo(x, y - height + halfH * 2);
  ctx.lineTo(x - halfW, y - height + halfH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(x - halfW, y - height + halfH);
  ctx.lineTo(x, y - height + halfH * 2);
  ctx.lineTo(x, y + halfH * 2);
  ctx.lineTo(x - halfW, y + halfH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(x + halfW, y - height + halfH);
  ctx.lineTo(x, y - height + halfH * 2);
  ctx.lineTo(x, y + halfH * 2);
  ctx.lineTo(x + halfW, y + halfH);
  ctx.closePath();
  ctx.fill();
}

function drawPixelRect(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function renderCell(cell) {
  const screen = gridToScreen(cell.x, cell.y);
  const baseShade = clamp(cell.terrain + Math.round(cell.landValue / 6), 25, 75);
  const grassTop = `hsl(${95 - cell.variant * 4} 32% ${baseShade}%)`;
  const grassEdge = `hsl(${84 - cell.variant * 3} 28% ${clamp(baseShade - 12, 14, 62)}%)`;
  drawDiamond(screen.x, screen.y, grassTop, grassEdge, state.camera.zoom);

  if (state.overlayMode === "landValue" && cell.kind !== "road") {
    const alpha = clamp(cell.landValue / 125, 0.08, 0.55);
    drawDiamond(
      screen.x,
      screen.y,
      `rgba(${Math.round(lerp(210, 60, cell.landValue / 100))}, ${Math.round(
        lerp(90, 190, cell.landValue / 100),
      )}, 70, ${alpha})`,
      "rgba(0,0,0,0)",
      state.camera.zoom * 0.92,
    );
  }

  if (cell.kind === "road") {
    ctx.strokeStyle = "#3a3d44";
    ctx.lineWidth = 10 * state.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(screen.x - 18 * state.camera.zoom, screen.y);
    ctx.lineTo(screen.x + 18 * state.camera.zoom, screen.y);
    ctx.moveTo(screen.x, screen.y - 10 * state.camera.zoom);
    ctx.lineTo(screen.x, screen.y + 10 * state.camera.zoom);
    ctx.stroke();
    drawPixelRect(screen.x - 8, screen.y - 2, 16, 4, "#d8ca89");
  }

  if (cell.kind === "park") {
    drawPixelRect(screen.x - 10, screen.y - 18, 20, 10, "#4e7b41");
    drawPixelRect(screen.x - 15, screen.y - 12, 12, 10, "#587f47");
    drawPixelRect(screen.x + 2, screen.y - 12, 12, 10, "#6f9a54");
    drawPixelRect(screen.x - 2, screen.y - 6, 4, 10, "#6a4f35");
  }

  if (cell.kind === "power") {
    drawIsoBlock(screen.x, screen.y - 4, 28 * state.camera.zoom, 16 * state.camera.zoom, {
      top: "#d8b086",
      left: "#876349",
      right: "#a7795a",
    });
    drawPixelRect(screen.x - 4, screen.y - 34, 3, 26, "#554f52");
    drawPixelRect(screen.x + 1, screen.y - 34, 3, 26, "#554f52");
    drawPixelRect(screen.x - 14, screen.y - 20, 28, 3, "#8f8181");
  }

  if (cell.kind === "water") {
    drawPixelRect(screen.x - 5, screen.y - 30, 10, 26, "#5877b0");
    drawPixelRect(screen.x - 13, screen.y - 40, 26, 10, "#7da5eb");
    drawPixelRect(screen.x - 14, screen.y - 43, 28, 3, "#d9ecff");
  }

  if (isZone(cell) && cell.level > 0) {
    drawBuilding(cell, screen);
  }

  if (state.hovered && state.hovered.x === cell.x && state.hovered.y === cell.y) {
    drawDiamond(screen.x, screen.y, "rgba(255, 255, 255, 0.12)", "rgba(255,255,255,0.75)", state.camera.zoom);
  }

  renderOverlay(cell, screen);
}

function drawBuilding(cell, screen) {
  const height = (14 + cell.level * 12) * state.camera.zoom;
  if (cell.kind === "residential") {
    drawIsoBlock(screen.x, screen.y - 2, 26 * state.camera.zoom, height, {
      top: ["#d2d58d", "#d0c87c", "#dbc67c"][cell.level - 1],
      left: ["#7f8450", "#88733e", "#94734a"][cell.level - 1],
      right: ["#a0a56b", "#b59c54", "#be9757"][cell.level - 1],
    });
    const roofY = screen.y - height + 2;
    drawPixelRect(screen.x - 6, roofY, 12, 4, ["#b24643", "#914c65", "#8f3c3a"][cell.level - 1]);
    for (let row = 0; row < cell.level + 1; row += 1) {
      drawPixelRect(screen.x - 8, screen.y - 12 - row * 8, 3, 4, "#f8f2bf");
      drawPixelRect(screen.x + 5, screen.y - 12 - row * 8, 3, 4, "#f8f2bf");
    }
  }

  if (cell.kind === "commercial") {
    drawIsoBlock(screen.x, screen.y - 2, 28 * state.camera.zoom, height + 6, {
      top: ["#7cb8b9", "#7ba0c6", "#96d5e8"][cell.level - 1],
      left: ["#3f696e", "#4a5f82", "#568499"][cell.level - 1],
      right: ["#569396", "#6e8ab3", "#73adc2"][cell.level - 1],
    });
    drawPixelRect(screen.x - 10, screen.y - 8, 20, 5, "#f3d36d");
    for (let row = 0; row < cell.level + 1; row += 1) {
      drawPixelRect(screen.x - 8, screen.y - 15 - row * 8, 4, 4, "#dff7ff");
      drawPixelRect(screen.x + 4, screen.y - 15 - row * 8, 4, 4, "#dff7ff");
    }
  }

  if (cell.kind === "industrial") {
    drawIsoBlock(screen.x, screen.y - 2, 30 * state.camera.zoom, height, {
      top: ["#d1b061", "#b99d63", "#ab8f6f"][cell.level - 1],
      left: ["#816536", "#6a5c3d", "#5f5549"][cell.level - 1],
      right: ["#a88849", "#8d7751", "#857566"][cell.level - 1],
    });
    drawPixelRect(screen.x - 12, screen.y - 12, 24, 4, "#774b42");
    drawPixelRect(screen.x + 4, screen.y - height - 4, 6, height - 4, "#5a5152");
    drawPixelRect(screen.x + 3, screen.y - height - 10, 8, 8, "#7d6969");
    drawPixelRect(screen.x + 10, screen.y - height - 20, 8, 8, "rgba(223,223,223,0.7)");
  }
}

function renderOverlay(cell, screen) {
  if (state.overlayMode === "services" && cell.kind !== "empty") {
    const powerColor = cell.power ? "rgba(97, 214, 119, 0.35)" : "rgba(221, 88, 78, 0.42)";
    drawDiamond(screen.x, screen.y, powerColor, "rgba(0,0,0,0)", state.camera.zoom * 0.72);
  }

  if (state.overlayMode !== "issues") {
    return;
  }
  const icons = cell.issues.slice(0, 3);
  icons.forEach((issue, index) => {
    const offsetX = (index - (icons.length - 1) / 2) * 14;
    drawIssueIcon(screen.x + offsetX * state.camera.zoom, screen.y - 36 * state.camera.zoom, issue);
  });
}

function drawIssueIcon(x, y, issue) {
  const size = 12 * state.camera.zoom;
  const colors = {
    road: "#474d56",
    power: "#d96f4d",
    water: "#4d7fd9",
    abandon: "#8e516a",
    sad: "#ab903d",
  };
  drawPixelRect(x - size / 2, y - size / 2, size, size, colors[issue] || "#ffffff");
  drawPixelRect(x - size / 2 + 2, y - size / 2 + 2, size - 4, size - 4, "rgba(255,255,255,0.24)");
  ctx.fillStyle = "#111";
  ctx.font = `${Math.round(8 * state.camera.zoom)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = {
    road: "R",
    power: "P",
    water: "W",
    abandon: "X",
    sad: "!",
  }[issue];
  ctx.fillText(label, x, y + 1);
}

function renderScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackdrop();

  const cells = [];
  forEachCell((cell) => cells.push(cell));
  cells.sort((left, right) => left.x + left.y - (right.x + right.y));
  for (const cell of cells) {
    renderCell(cell);
  }

  drawLegend();
}

function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#89bcc2");
  sky.addColorStop(0.65, "#d6cb96");
  sky.addColorStop(1, "#d49564");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(79, 117, 116, 0.18)";
  for (let index = 0; index < 6; index += 1) {
    const y = 110 + index * 30;
    ctx.beginPath();
    ctx.moveTo(0, y + 34);
    for (let x = 0; x <= canvas.width; x += 60) {
      ctx.lineTo(x, y + Math.sin((x + index * 55) * 0.01) * 20);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLegend() {
  ctx.fillStyle = "rgba(33, 30, 25, 0.64)";
  ctx.fillRect(18, canvas.height - 78, 320, 50);
  ctx.fillStyle = "#f6f0df";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.fillText("Drag: paint  |  Wheel: zoom  |  WASD: pan  |  Space: pause", 34, canvas.height - 47);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function handlePointerMove(event) {
  const point = pointerPosition(event);
  const gridPoint = screenToGrid(point.x, point.y);
  if (gridPoint.x >= 0 && gridPoint.y >= 0 && gridPoint.x < GRID_W && gridPoint.y < GRID_H) {
    state.hovered = gridPoint;
    if (state.dragPainting) {
      const key = `${gridPoint.x},${gridPoint.y},${state.selectedTool}`;
      if (key !== state.lastPaintKey) {
        placeToolAt(getCell(gridPoint.x, gridPoint.y), state.selectedTool);
        state.lastPaintKey = key;
      }
    }
  } else {
    state.hovered = null;
  }
  renderUI();
}

function handlePointerDown(event) {
  const point = pointerPosition(event);
  const gridPoint = screenToGrid(point.x, point.y);
  const cell = getCell(gridPoint.x, gridPoint.y);
  if (!cell) {
    return;
  }
  if (event.button === 2) {
    bulldoze(cell);
    return;
  }
  if (event.button !== 0) {
    return;
  }
  state.dragPainting = true;
  state.lastPaintKey = `${gridPoint.x},${gridPoint.y},${state.selectedTool}`;
  placeToolAt(cell, state.selectedTool);
}

function handlePointerUp() {
  state.dragPainting = false;
  state.lastPaintKey = "";
}

function handleWheel(event) {
  event.preventDefault();
  state.camera.zoom = clamp(state.camera.zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.65, 1.6);
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    state.paused = !state.paused;
    renderUI();
    return;
  }
  if (key === "w") {
    state.camera.y += 24;
  }
  if (key === "s") {
    state.camera.y -= 24;
  }
  if (key === "a") {
    state.camera.x += 28;
  }
  if (key === "d") {
    state.camera.x -= 28;
  }
  if (key === "b") {
    state.selectedTool = "bulldozer";
    renderUI();
  }

  const toolIndex = Number(key) - 1;
  if (toolIndex >= 0 && toolIndex < TOOL_DEFS.length) {
    state.selectedTool = TOOL_DEFS[toolIndex].id;
    refreshStatus(toolById(state.selectedTool).tip);
    renderUI();
  }
}

function gameLoop(timestamp) {
  const deltaSeconds = (timestamp - state.lastFrame) / 1000;
  state.lastFrame = timestamp;
  if (!state.paused) {
    state.tickAccumulator += deltaSeconds * state.speed;
    while (state.tickAccumulator >= SIM_TICK_SECONDS) {
      simulateStep(true);
      state.tickAccumulator -= SIM_TICK_SECONDS;
    }
  }
  renderScene();
  requestAnimationFrame(gameLoop);
}

function seedStarterTown() {
  const starterRoads = [
    [8, 5],
    [8, 6],
    [8, 7],
    [8, 8],
    [8, 9],
    [8, 10],
    [7, 8],
    [6, 8],
    [9, 8],
    [10, 8],
    [11, 8],
  ];

  for (const [x, y] of starterRoads) {
    const cell = getCell(x, y);
    cell.kind = "road";
  }

  getCell(7, 6).kind = "residential";
  getCell(7, 6).level = 1;
  getCell(9, 6).kind = "commercial";
  getCell(9, 6).level = 1;
  getCell(10, 9).kind = "industrial";
  getCell(10, 9).level = 1;
  getCell(6, 9).kind = "park";
  getCell(5, 8).kind = "water";
  getCell(12, 8).kind = "power";
  pushLog("Starter grid", "A tiny main street is in place so the simulation starts alive.");
}

function bindUI() {
  canvas.addEventListener("mousemove", handlePointerMove);
  canvas.addEventListener("mousedown", handlePointerDown);
  canvas.addEventListener("mouseup", handlePointerUp);
  canvas.addEventListener("mouseleave", handlePointerUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("mouseup", handlePointerUp);
  window.addEventListener("keydown", handleKeyDown);

  ui.pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    renderUI();
  });

  ui.speedButton.addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : 1;
    renderUI();
  });

  for (const button of ui.overlayButtons) {
    button.addEventListener("click", () => {
      state.overlayMode = button.dataset.overlay;
      renderUI();
    });
  }
}

buildInitialGrid();
seedStarterTown();
bindUI();
simulateStep(false);
refreshStatus(toolById(state.selectedTool).tip);
renderUI();
requestAnimationFrame(gameLoop);
