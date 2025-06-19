# 🌱 Vegetation Map Netherlands

Interactive web application for exploring how trees, bushes and grass are distributed across the Netherlands at the 4‑digit postcode (PC4) level.

---

## Project goals

* **Visual question:** *Where in the Netherlands is vegetation richest and most balanced across trees (🌳), bushes (🌿) and grass (🌾)?*

---

## Features

| Category                     | Description                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| **Drill‑down map**           | National choropleth → province view with individual PC4 polygons                    |
| **Dual colour modes**        | 1) Heat map for total vegetation (RdYlGn)  2) RGB composite showing mix of 🌳🌿🌾   |
| **Postcode search**          | Jump directly to any PC4 by typing its 4 digits                                     |
| **Ranking panel**            | Top/bottom 10 and balance‑score league tables; clickable rows pan/zoom the map      |
| **Rich tool‑tips**           | Hover shows absolute percentages, total vegetation, balance score & overlap warning |
| **Tiles + projection**       | OpenStreetMap raster tiles for context; d3‑geo–Mercator projection                  |
| **Offline cache**            | First‑load fetches are stored in IndexedDB ⇒ subsequent visits load instantly       |

---

## Video demo

[![Watch the video](https://youtu.be/qgWqU1Uqg6w)]

---

## Dataset

| File                     | Source                                        | Description                                               |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------- |
| `data/vegetation.csv`    | Canvas                                        | % surface area covered by trees, bushes and grass per PC4 |
| `data/pc4.geojson`       | CBS PDOK                                      | Polygon geometry for each 4‑digit postcode                |
| `data/provinces.geojson` | CBS PDOK                                      | Polygon geometry for the 12 Dutch provinces               |

The CSV values sometimes sum to > 100 % because grass beneath tree canopies is double‑counted; polygons without vegetation data are flagged `total = -1`.

---

## Quick start

> Requires **Node ≥18** or **Python ≥3.8** (for local web‑server only).

```bash
# 1. Clone repository
$ git clone https://github.com/massuus/dutch-vegetation-visualizer.git
$ cd dutch-vegetation-visualizer

# 2. Install dev server of your choice
$ npm i -g serve            # or use python -m http.server

# 3. Run local server (pick one)
$ serve .                   # http://localhost:5000 (default)
# or
$ python3 -m http.server 8000 & # http://localhost:8000
```

Open the URL in your browser. The first load takes \~3 minutes while datasets are downloaded and cached; subsequent loads are instant.

---

## Project structure

```
.
├── index.html          # Entry point
├── style.css           # Styling
├── script.js           # D3 logic & interactions
├── data/               # GeoJSON + CSV datasets (≈18 MB total)
└── README.md           # This file
```

---

## Design notes

* **Colour encoding**

  * *Mode 1* – `d3.interpolateRdYlGn` on **total vegetation (0 – 100 %+)**.
  * *Mode 2* – Custom function maps (trees,bushes,grass) → `(R,G,B)`.
* **Balance score (⚖️)**
  `100 – σ` of (t,b,g). Higher ⇒ more equal distribution.
* **Projection & tiles**
  `d3.geoMercator()` aligned with OSM XYZ tile grid via `d3-tile`.
* **Performance**
  GeoJSON is \~12 MB; first load parsed client‑side, then cached in IndexedDB (object store `VegMapCache`).
* **Accessibility**
  Colour toggle button, logical tab order in ranking list, readable font sizes, legend always visible.

---

## License

Dataset licenses follow their respective sources (PDOK Open Data, RIVM Land Use).

