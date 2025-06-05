/* ─────────────────────────────────────────────────────────────
   GreenBalance  v8.1
   • initial OSM tiles correctly aligned
   • leaner click-handlers
   ───────────────────────────────────────────────────────────── */

/* ------------ CONFIG ------------------------------------------------- */
const GEO_URL  = 'data/pc4-simplified.geojson';
const VEG_URL  = 'data/vegetation.csv';
const PROV_URL = 'data/provinces.geojson';

const W = 800, H = 800;
const gamma = 2;                              // colour “speed”

/* ------------ SVG & LAYERS ------------------------------------------- */
const svg = d3.select('#map')
  .attr('viewBox',`0 0 ${W} ${H}`)
  .attr('preserveAspectRatio','xMidYMid meet');

const tileLayer = svg.append('g').attr('class','tile-layer'); // raster
const mapLayer  = svg.append('g').attr('class','map-layer');  // vectors
const uiLayer   = svg.append('g').attr('class','ui-layer');   // fixed ui

/* ------------ ZOOM --------------------------------------------------- */
const zoom = d3.zoom()
  .scaleExtent([1,8])
  .touchable(()=>false)
  .on('zoom', e=>{
     mapLayer.attr('transform', e.transform);
     const m = mergeTransforms(e.transform, projTransform());
     updateTiles(m);
  });
svg.call(zoom);

/* ------------ GLOBAL STATE ------------------------------------------ */
let vegMap = new Map();        // pc4 -> {trees,bushes,grass}
let pc4ByCode = new Map();     // pc4 -> {code,total,v,feature}
let provinceGeo, postcodeGeo;
let currentProvince = null;

/* ------------ PROJECTION / PATH ------------------------------------- */
const projection = d3.geoMercator();
const path       = d3.geoPath().projection(projection);

/* helper → current proj as zoomTransform */
function projTransform(){
  const k          = projection.scale() * 2 * Math.PI;
  const [tx,ty]    = projection.translate();
  return d3.zoomIdentity.translate(tx,ty).scale(k);
}

/* helper to combine zoom transform with projection */
function mergeTransforms(a,b){
  return d3.zoomIdentity
          .translate(a.x + a.k*b.x, a.y + a.k*b.y)
          .scale(a.k*b.k);
}

/* ------------ COLOUR SCALES ----------------------------------------- */
const vegColor = p => d3.interpolateRdYlGn(
  Math.pow(Math.max(0,Math.min(100,p))/100, gamma)
);
const sumPct = v => Math.min(100, v.trees+v.bushes+v.grass);

/* ------------ TOOLTIP ------------------------------------------------ */
const tooltip = d3.select('body').append('div')
  .attr('class','tooltip').style('opacity',0);

/* ------------ UI CONTROLS ------------------------------------------- */
const controls = {
  trees:  d3.select('#trees'),
  bushes: d3.select('#bushes'),
  grass:  d3.select('#grass')
};

function updateResults(){
  const t = +controls.trees.property('value');
  const b = +controls.bushes.property('value');
  const g = +controls.grass.property('value');

  d3.select('#pollution').text((100 - (t*0.5 + b*0.3 + g*0.2)).toFixed(1));
  d3.select('#heat').text((100 - (t*0.4 + b*0.2 + g*0.4)).toFixed(1));
  d3.select('#biodiversity').text(((t*0.4 + b*0.4 + g*0.2)).toFixed(1));
}

Object.values(controls).forEach(ctrl =>
  ctrl.on('input', updateResults)
);
updateResults();

/* ------------ LOADER ------------------------------------------------- */
const loader = d3.select('#loader');

/* ------------ OSM TILE under-lay  ------------------------------------ */
const tiler = d3.tile().size([W,H]).tileSize(256);

function updateTiles(t = projTransform()){   // default = projection
  const tiles = tiler.scale(t.k).translate([t.x,t.y])();

  tileLayer
    .attr('transform',`scale(${tiles.scale}) translate(${tiles.translate})`)
    .selectAll('image')
    .data(tiles, d=>d)
    .join('image')
      .attr('xlink:href', d =>
        `https://tile.openstreetmap.org/${d[2]}/${d[0]}/${d[1]}.png`)
      .attr('crossorigin','anonymous')
      .attr('x',d=>d[0]).attr('y',d=>d[1])
      .attr('width',1).attr('height',1);
}

/* ------------ BACK BUTTON (svg-fixed) ------------------------------- */
function showBack(){
  uiLayer.selectAll('text.back').data([null])
    .join('text')
      .attr('class','back')
      .attr('x',20).attr('y',30)
      .text('🔙 Back to provinces')
      .on('click', ()=>{
        currentProvince=null;
        drawProvinces();
        svg.transition().duration(500)
           .call(zoom.transform, d3.zoomIdentity);
      });
}
function hideBack(){ uiLayer.selectAll('text.back').remove(); }

/* ------------ LEGEND (once) ----------------------------------------- */
function addLegend(){
  if(uiLayer.select('.legend').size()) return;
  const g = uiLayer.append('g')
      .attr('class','legend')
      .attr('transform',`translate(20, ${H-45})`);

  const grad = uiLayer.append('defs').append('linearGradient')
      .attr('id','vegGrad').attr('x1','0%').attr('y1','0%')
      .attr('x2','100%').attr('y2','0%');
  grad.selectAll('stop').data([
    {o:0,c:'#a50026'},{o:.5,c:'#ffffbf'},{o:1,c:'#006837'}
  ]).enter().append('stop')
      .attr('offset',d=>d.o*100+'%').attr('stop-color',d=>d.c);

  g.append('rect').attr('width',180).attr('height',14)
    .attr('fill','url(#vegGrad)');
  g.append('text').attr('x',0).attr('y',26).text('0%');
  g.append('text').attr('x',90).attr('y',26).attr('text-anchor','middle').text('50%');
  g.append('text').attr('x',180).attr('y',26).attr('text-anchor','end').text('100%');
  g.append('text').attr('x',0).attr('y',40).text('Total vegetation').attr('fill','#444');
}

/* ------------ RANK PANEL -------------------------------------------- */
const rankPanel = d3.select('#rank-panel');
function renderRank(list,title){
  rankPanel.html('').classed('hidden',false);
  rankPanel.append('h3').text(title);

  const best = list.slice(0,10);
  const worst= list.slice(-10).reverse();

  const add = (lbl,data) =>{
    const sec = rankPanel.append('div');
    sec.append('strong').text(lbl);
    sec.append('ol').selectAll('li')
      .data(data)
      .enter().append('li')
        .html(d=>`${d.code}<span class="v">${d.total.toFixed(1)}%</span>`)
        .attr('class', d=>d.total<0?'nod':null)
        .on('click',(_,d)=>handleRankClick(d.code));
  };
  add('Top 10',best);
  add('Bottom 10',worst);
}

/* ------------ DRAW PROVINCES ---------------------------------------- */
function drawProvinces(){
  hideBack();
  rankPanel.classed('hidden',false);

  projection.fitExtent([[20,20],[W-20,H-20]], provinceGeo);
  updateTiles();                // align tiles right away

  mapLayer.html('')
    .selectAll('path')
    .data(provinceGeo.features)
    .enter().append('path')
      .attr('class','province')
      .attr('d', path)
      .attr('fill', d=>vegColor(d.properties.avgVeg||0))
      .attr('stroke','#444').attr('stroke-width',1)
      .on('mouseover', function(_,d){
          d3.select(this).attr('stroke-width',2);
          tooltip.style('opacity',1)
                 .html(`<strong>${d.properties.statnaam}</strong><br>
                        Avg vegetation: ${d.properties.avgVeg.toFixed(1)}%`);
      })
      .on('mousemove', e=>tooltip.style('left',(e.pageX+10)+'px')
                                 .style('top',(e.pageY-28)+'px'))
      .on('mouseout', function(){
          d3.select(this).attr('stroke-width',1);
          tooltip.style('opacity',0);
      })
      .on('click', (_,d)=>zoomProvince(d));

  /* national rank only once */
  if(!drawProvinces.done){
     const list=[...pc4ByCode.values()]
                 .filter(d=>d.total>=0)
                 .sort((a,b)=>d3.descending(a.total,b.total));
     renderRank(list,'National ranking');
     drawProvinces.done=true;
  }
}

/* helper */
const codeOf = f => f.properties.pc4_code?.toString()||f.properties.postcode;

/* ------------ ZOOM INTO A PROVINCE ----------------------------------- */
function zoomProvince(prov){
  currentProvince = prov;
  showBack();

  const keep = prov.postcodes;              // pre-cached array
  projection.fitExtent([[20,20],[W-20,H-20]], {type:'FeatureCollection',features:keep});
  updateTiles();

  mapLayer.html('')
    .selectAll('path')
    .data(keep)
    .enter().append('path')
      .attr('class','pc4')
      .attr('d', path)
      .attr('fill', f=>vegColor(pc4ByCode.get(codeOf(f)).total))
      .attr('stroke','#fff').attr('stroke-width',0.4)
      .on('mouseover', pc4Over)
      .on('mousemove', e=>tooltip.style('left',(e.pageX+10)+'px')
                                 .style('top',(e.pageY-28)+'px'))
      .on('mouseout', pc4Out);

  /* province rank */
  const list = keep.map(f=>pc4ByCode.get(codeOf(f)))
                   .filter(d=>d.total>=0)
                   .sort((a,b)=>d3.descending(a.total,b.total));
  renderRank(list, prov.properties.statnaam);
}

/* ----- path hover helpers ------------------------------------------- */
function pc4Over(e,f){
  d3.select(this).attr('stroke-width',1.2);
  const d = pc4ByCode.get(codeOf(f)); if(!d) return;
  tooltip.style('opacity',1).html(`
    <strong>Postcode:</strong> ${d.code}<br>
    🌳 ${d.v.trees}% &nbsp; 🌿 ${d.v.bushes}% &nbsp; 🌾 ${d.v.grass}%<br>
    🌱 <em>Total:</em> ${d.total.toFixed(1)}%
  `);
}
function pc4Out(){
  d3.select(this).attr('stroke-width',0.4);
  tooltip.style('opacity',0);
}

/* ----- rank-panel click --------------------------------------------- */
function handleRankClick(code){
  const d = pc4ByCode.get(code); if(!d) return;

  /* ensure right province view */
  if(!currentProvince ||
     !d3.geoContains(currentProvince,d3.geoCentroid(d.feature))){
    const prov = provinceGeo.features.find(p=>
        d3.geoContains(p,d3.geoCentroid(d.feature)));
    if(prov) zoomProvince(prov);
  }

  /* highlight */
  mapLayer.selectAll('.highlight').classed('highlight',false);
  mapLayer.selectAll('path.pc4')
          .filter(f=>codeOf(f)===code)
          .classed('highlight',true)
          .each(function(){ this.parentNode.appendChild(this); });
}

/* ------------ DATA LOAD --------------------------------------------- */
Promise.all([
  d3.json(PROV_URL),
  d3.json(GEO_URL),
  d3.dsv(';',VEG_URL,d=>({
    postcode:d.Postcode,
    trees:+d.PercentageTrees.replace(',','.'),
    bushes:+d.PercentageBushes.replace(',','.'),
    grass:+d.PercentageGrass.replace(',','.')
  }))
]).then(([provGeo, pc4Geo, veg])=>{

  /* vegetation map */
  veg.forEach(r=>vegMap.set(r.postcode.toString(), r));

  /* postcode registry */
  pc4Geo.features.forEach(f=>{
    const code = codeOf(f);
    const v    = vegMap.get(code);
    pc4ByCode.set(code,{
      code,
      v: v||{trees:0,bushes:0,grass:0},
      total: v ? sumPct(v) : -1,
      feature: f
    });
  });

  /* attach postcodes to provinces + compute avg */
  provGeo.features.forEach(p=>{
    p.postcodes = pc4Geo.features.filter(f=>
        d3.geoContains(p,d3.geoCentroid(f)));
    const vals = p.postcodes
        .map(f=>pc4ByCode.get(codeOf(f)).total)
        .filter(t=>t>=0);
    p.properties.avgVeg = vals.length ? d3.mean(vals) : 0;
  });

  provinceGeo = provGeo;
  postcodeGeo = pc4Geo;

  addLegend();
  drawProvinces();

}).catch(console.error)
  .finally(()=>loader.classed('hidden',true));
