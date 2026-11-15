# 09 · Accessibility and QA

## Accessibility

- **Contrast:** body `#B4B4BC` and muted `#A0A0A8` pass 4.5:1 on black. `#6E6E76` is for ≥ 11 sp captions only, never for essential information.
- **TalkBack:**
  - Every number is announced with unit and context, e.g. "Air temperature, Bengaluru, live at 13:45: 29.2 degrees Celsius".
  - Map: content description "Map of Karnataka coloured by air temperature". The tap read-out is announced as a live region.
  - Provide an **accessible alternative** to tapping the map: a "Read a place" action that opens a list of the places in `places-*.json` with their values.
  - Timeline: a slider with a value description ("1998, record" / "2050, projection, middle road").
  - Swatches and effects are decorative (no description); the layer name carries the meaning.
- **Touch targets** ≥ 48 dp everywhere, including chips and glass buttons.
- **Font scaling** to 200%: layouts reflow and big numbers shrink to fit on one line (min 44 sp) without truncating units.
- **Reduced motion:** see doc 07. Respect it everywhere, including the Earth.
- **Colour independence:** past/now use words ("PAST", "NOW"), not only amber/cyan. Change values carry a sign and words ("1.2 °C cooler").
- **Keyboard / switch access:** all controls focusable in reading order; the sheet's focus is trapped while it's modal.

## Acceptance checklist

### Theme
- [ ] Background is pure `#000000` on every screen, status bar and navigation bar included. No light surfaces anywhere.
- [ ] Jura and Poppins are bundled and used exactly per the type table; numbers use tabular figures.
- [ ] No shadows, no elevation tint, no glow, no lift on press.
- [ ] The spectrum gradient appears only on the Simulate read-out number, the timeline fill and the selected segment.
- [ ] Screens match `mockups/png/` at 360 dp (screenshot tests).

### Native feel
- [ ] Bottom navigation (rail on tablets), bottom sheets, edge-to-edge, gesture navigation, predictive back.
- [ ] Haptics on selections, timeline ticks and the crosshair.
- [ ] No WebView screens.

### Data honesty
- [ ] Every visible number has a time and a source; the API URLs match doc 04 (unit tests).
- [ ] Missing data says "No record", "No projection", "Unavailable" or "Not connected yet". Nothing blank, nothing invented.
- [ ] Projections are labelled IPCC AR6 scenarios and apply to temperature layers only.
- [ ] Compare shows the weather-versus-climate caveat.
- [ ] Ground temperature uses the 0–7 cm soil layer for both live and past.
- [ ] The 16-system variable values carry the "REFERENCE" badge.

### Map and effects
- [ ] Maps open on **Day**; Night is a toggle.
- [ ] The outline matches the GeoJSON; fields and effects are clipped to it.
- [ ] All six effects match `reference/screenshots/web-sim-*.png` in character; rainfall shows clouds and **no rain streaks**.
- [ ] Tap-to-read shows the interpolated value and "Near <place>".
- [ ] Effects pause off-screen and under modal sheets; reduced motion shows still frames.
- [ ] Compare maps stay in sync during pan/zoom and share one colour range.

### Performance and robustness
- [ ] Budgets in doc 08 are met on a mid-range device (for example a Pixel 6a class phone).
- [ ] A cold start makes at most one live-grid call per region. Past days come from the cache after the first load.
- [ ] HTTP 429 shows the retry message and recovers. Offline shows cached data with "as of".
- [ ] No ANRs; all raster maths runs off the main thread.

### Content
- [ ] The About screen lists every credit in the README.
- [ ] Copy is short, plain and in sentence case, apart from Jura uppercase labels.

## Test data tips

- Use MockWebServer fixtures captured from the real endpoints for both regions (live, past day 2016-11-15 hour 13, record, AQ).
- A date before 2022-09 must skip the PM2.5 call.
- Feb 29 → Feb 28 for non-leap years.
- Force 429 responses to test back-off.
