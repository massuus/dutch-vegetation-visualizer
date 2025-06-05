/* ------------ CONFIG ------------------------------------------------- */
const GEO_URL  = 'data/pc4.geojson';
const VEG_URL  = 'data/vegetation.csv';
const PROV_URL = 'data/provinces.geojson';

const W = 800, H = 800;
const gamma = 2;

/* ------------ SVG & LAYERS ------------------------------------------- */
const svg = d3.select('#map')
  .attr('viewBox', `0 0 ${W} ${H}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

const tileLayer = svg.append('g').attr('class', 'tile-layer');
const mapLayer  = svg.append('g').attr('class', 'map-layer');
const uiLayer   = svg.append('g').attr('class', 'ui-layer');

/* ------------ GLOBAL STATE ------------------------------------------ */
let vegMap = new Map();
let pc4ByCode = new Map();
let provinceGeo, postcodeGeo;
let currentProvince = null;

/* ------------ PROJECTION / PATH ------------------------------------- */
const projection = d3.geoMercator();
const path = d3.geoPath().projection(projection);

function projTransform() {
  const k = projection.scale() * 2 * Math.PI;
  const [tx, ty] = projection.translate();
  return d3.zoomIdentity.translate(tx, ty).scale(k);
}

/* ------------ COLOR SCALE ------------------------------------------- */
const vegColor = p => d3.interpolateRdYlGn(Math.pow(Math.max(0, Math.min(100, p)) / 100, gamma));
const sumPct = v => Math.min(100, v.trees + v.bushes + v.grass);

/* ------------ TOOLTIP ------------------------------------------------ */
const tooltip = d3.select('body').append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0);

/* ------------ LOADER ------------------------------------------------- */
const loader = d3.select('#loader');

/* ------------ TILE HANDLER ------------------------------------------- */
const tiler = d3.tile().size([W, H]).tileSize(256);

function updateTiles(t = projTransform()) {
  const tiles = tiler.scale(t.k).translate([t.x, t.y])();
  tileLayer
    .attr('transform', `scale(${tiles.scale}) translate(${tiles.translate})`)
    .selectAll('image')
    .data(tiles, d => d)
    .join('image')
      .attr('xlink:href', d => `https://tile.openstreetmap.org/${d[2]}/${d[0]}/${d[1]}.png`)
      .attr('x', d => d[0]).attr('y', d => d[1])
      .attr('width', 1).attr('height', 1);
}

/* ------------ BACK BUTTON -------------------------------------------- */
function showBack() {
  const group = uiLayer.selectAll('g.back').data([null]).join('g').attr('class', 'back');

  group.selectAll('*').remove();

  const text = '← Back to provinces';
  const textElem = group.append('text')
    .attr('x', 20)
    .attr('y', 30)
    .text(text)
    .attr('class', 'back-button');

  const bbox = textElem.node().getBBox();

  group.insert('rect', 'text')
    .attr('x', bbox.x - 8)
    .attr('y', bbox.y - 4)
    .attr('width', bbox.width + 16)
    .attr('height', bbox.height + 8)
    .attr('class', 'back-button-bg');

  group.style('cursor', 'pointer')
    .on('click', () => {
      currentProvince = null;
      drawProvinces();
    });
}

function hideBack() {
  uiLayer.selectAll('g.back').remove();
}

/* ------------ LEGEND ------------------------------------------------- */
function addLegend() {
  if (uiLayer.select('.legend').size()) return;

  const g = uiLayer.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(20, ${H - 45})`);

  const grad = uiLayer.append('defs').append('linearGradient')
    .attr('id', 'vegGrad')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '100%').attr('y2', '0%');

  grad.selectAll('stop').data([
    { o: 0, c: '#a50026' },
    { o: 0.5, c: '#ffffbf' },
    { o: 1, c: '#006837' }
  ]).enter().append('stop')
    .attr('offset', d => d.o * 100 + '%')
    .attr('stop-color', d => d.c);

  g.append('rect').attr('width', 180).attr('height', 14)
    .attr('fill', 'url(#vegGrad)');

  g.append('text').attr('x', 0).attr('y', 26).text('0%');
  g.append('text').attr('x', 90).attr('y', 26).attr('text-anchor', 'middle').text('50%');
  g.append('text').attr('x', 180).attr('y', 26).attr('text-anchor', 'end').text('100%');
  g.append('text').attr('x', 0).attr('y', 40).text('Total vegetation').attr('fill', '#444');
}

/* ------------ RANK PANEL -------------------------------------------- */
const rankPanel = d3.select('#rank-panel');

function renderRank(list, title) {
  rankPanel.html('').classed('hidden', false);
  rankPanel.append('h3').text(title);

  const valid = list.filter(d => d.total >= 0);
  const best = valid.slice(0, 10);
  const worst = valid.slice(-10).reverse();
  const missing = list.filter(d => d.total < 0);

  const add = (label, data) => {
    const section = rankPanel.append('div');
    section.append('strong').text(label);
    section.append('ol').selectAll('li')
      .data(data)
      .enter().append('li')
      .html(d => `${d.code}<span class="v">${d.total >= 0 ? d.total.toFixed(1) + '%' : 'Missing'}</span>`)
      .attr('class', d => d.total < 0 ? 'nod' : null)
      .on('click', (_, d) => {
        if (d.total >= 0) handleRankClick(d.code);
      });
  };

  add('Top 10', best);
  add('Bottom 10', worst);
  if (missing.length > 0) add('No Data', missing);
}

/* ------------ DRAW PROVINCES ---------------------------------------- */
function drawProvinces() {
  hideBack();
  rankPanel.classed('hidden', false);

  projection.fitExtent([[20, 20], [W - 20, H - 20]], provinceGeo);
  updateTiles();

  mapLayer.html('')
    .selectAll('path')
    .data(provinceGeo.features)
    .enter().append('path')
    .attr('class', 'province')
    .attr('d', path)
    .attr('fill', d => vegColor(d.properties.avgVeg || 0))
    .attr('stroke', '#444')
    .attr('stroke-width', 1)
    .on('mouseover', function (_, d) {
      d3.select(this).attr('stroke-width', 2);
      tooltip.style('opacity', 1).html(`
        <strong>${d.properties.statnaam}</strong><br>
        Avg vegetation: ${d.properties.avgVeg.toFixed(1)}%
      `);
    })
    .on('mousemove', e => tooltip.style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 28) + 'px'))
    .on('mouseout', function () {
      d3.select(this).attr('stroke-width', 1);
      tooltip.style('opacity', 0);
    })
    .on('click', (_, d) => zoomProvince(d));

  const list = [...pc4ByCode.values()].sort((a, b) => d3.descending(a.total, b.total));
  renderRank(list, 'National ranking');
}

/* ------------ ZOOM INTO PROVINCE ------------------------------------ */
function zoomProvince(prov) {
  currentProvince = prov;
  showBack();

  const keep = prov.postcodes;
  projection.fitExtent([[20, 20], [W - 20, H - 20]], { type: 'FeatureCollection', features: keep });
  updateTiles();

  mapLayer.html('')
    .selectAll('path')
    .data(keep)
    .enter().append('path')
    .attr('class', 'pc4')
    .attr('d', path)
    .attr('fill', f => vegColor(pc4ByCode.get(codeOf(f)).total))
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.4)
    .on('mouseover', pc4Over)
    .on('mousemove', e => tooltip.style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 28) + 'px'))
    .on('mouseout', pc4Out);

  const list = keep.map(f => pc4ByCode.get(codeOf(f)))
    .filter(d => d.total >= 0)
    .sort((a, b) => d3.descending(a.total, b.total));

  renderRank(list, prov.properties.statnaam);
}

/* ------------ HELPERS ------------------------------------------------ */
function codeOf(f) {
  return f.properties.pc4_code?.toString() || f.properties.postcode;
}

function pc4Over(e, f) {
  d3.select(this).attr('stroke-width', 1.2);
  const d = pc4ByCode.get(codeOf(f)); if (!d) return;
  tooltip.style('opacity', 1).html(`
    <strong>Postcode:</strong> ${d.code}<br>
    🌳 ${d.v.trees}% &nbsp; 🌿 ${d.v.bushes}% &nbsp; 🌾 ${d.v.grass}%<br>
    🌱 <em>Total:</em> ${d.total.toFixed(1)}%
  `);
}

function pc4Out() {
  d3.select(this).attr('stroke-width', 0.4);
  tooltip.style('opacity', 0);
}

function handleRankClick(code) {
  const d = pc4ByCode.get(code);
  if (!d) return;

  const f = d.feature;
  const targetCentroid = d3.geoCentroid(f);

  // Find and zoom to correct province if not already in view
  const prov = provinceGeo.features.find(p =>
    d3.geoContains(p, targetCentroid));

  if (!currentProvince || currentProvince !== prov) {
    zoomProvince(prov);
  }

  // Wait until province view has rendered
  setTimeout(() => {
    // Highlight the selected postcode
    mapLayer.selectAll('.highlight').classed('highlight', false);

    const selection = mapLayer.selectAll('path.pc4')
      .filter(f => codeOf(f) === code)
      .classed('highlight', true)
      .each(function () {
        // Move to front
        this.parentNode.appendChild(this);

        // Simulate tooltip
        const bounds = this.getBoundingClientRect();
        tooltip.style('opacity', 1).html(`
          <strong>Postcode:</strong> ${d.code}<br>
          🌳 ${d.v.trees}% &nbsp; 🌿 ${d.v.bushes}% &nbsp; 🌾 ${d.v.grass}%<br>
          🌱 <em>Total:</em> ${d.total.toFixed(1)}%
        `)
        .style('left', (bounds.x + bounds.width / 2 + 10) + 'px')
        .style('top', (bounds.y + bounds.height / 2 - 28) + 'px');
      });
  }, 250); // small delay for zoom/render
}


/* ------------ DATA LOAD --------------------------------------------- */
Promise.all([
  d3.json(PROV_URL),
  d3.json(GEO_URL),
  d3.dsv(';', VEG_URL, d => ({
    postcode: d.Postcode,
    trees: +d.PercentageTrees.replace(',', '.'),
    bushes: +d.PercentageBushes.replace(',', '.'),
    grass: +d.PercentageGrass.replace(',', '.')
  }))
]).then(([provGeo, pc4Geo, veg]) => {
  veg.forEach(r => vegMap.set(r.postcode.toString(), r));

  pc4Geo.features.forEach(f => {
    const code = codeOf(f);
    const v = vegMap.get(code);
    pc4ByCode.set(code, {
      code,
      v: v || { trees: 0, bushes: 0, grass: 0 },
      total: v ? sumPct(v) : -1,
      feature: f
    });
  });

  provGeo.features.forEach(p => {
    p.postcodes = pc4Geo.features.filter(f => d3.geoContains(p, d3.geoCentroid(f)));
    const vals = p.postcodes.map(f => pc4ByCode.get(codeOf(f)).total).filter(t => t >= 0);
    p.properties.avgVeg = vals.length ? d3.mean(vals) : 0;
  });

  provinceGeo = provGeo;
  postcodeGeo = pc4Geo;

  addLegend();
  drawProvinces();
}).then(() => {
  loader.classed('hidden', true);
}).catch(console.error);

document.body.addEventListener('click', e => {
  if (!e.target.closest('li') && !e.target.closest('svg')) {
    mapLayer.selectAll('.highlight').classed('highlight', false);
    tooltip.style('opacity', 0);
  }
});
