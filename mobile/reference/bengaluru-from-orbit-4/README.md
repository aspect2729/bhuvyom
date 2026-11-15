# Bengaluru From Orbit — design canvas export

Four artboards recreated from the URANUS site: Home, Simulation, Compare, Future predictions.

- project/canvas.json — canvas layout (artboard positions and sizes)
- project/*.dc.html — one Design Component page per artboard (Main.dc.html = Future predictions)
- assets/ — images and fonts the pages use

Inside the .dc.html files, images and fonts are referenced as /_blob/<id>. Those links resolve only inside the hosted canvas. Mapping:
d2e71c37… earth-clear.jpg · 67d4db5f… earth-clouds.jpg · 43d05b65… hero-globe.jpg · 340b3491… chevron.svg
74ac33ad… Jura-Variable.woff2 · be326da0… Poppins-Light.woff2 · a85cab6f… Poppins-Regular.woff2 · 016814f1… Poppins-Medium.woff2

Snapshot notes: Simulation and Compare maps show "live data unavailable" (captured offline). Place picker and chart hover on Future predictions are static.
