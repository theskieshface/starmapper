# Hałeya's Star Mapper

skibidi sigma rizler gyatgaytsigmaismga ohio alpha omega fanum tax 6767 69420 41

The Star Mapper is an interactive 3D star projection web app for plotting stars by coordinates (in light years), editing stellar metadata, and exploring the map with smooth arcball rotation and zoom.

## Features

- Add stars with:
  - Name
  - 3D coordinates (`x`, `y`, `z`) in light years
  - Spectral type
  - Temperature (K)
  - Luminosity (L☉)
- Select and edit stars directly
- 3D map with:
  - Arcball drag rotation
  - Scroll zoom
  - Toggleable XY / XZ / YZ grids
  - Axis labels and dynamic distance markers
- Stellar rendering:
  - Color based on Teff / spectral type
  - Luminosity tuning mode with glow
  - Overlap-aware visual dimming
- CSV import/export for star maps

## Files

- `index.html` – app layout
- `styles.css` – styling
- `app.js` – 3D logic, interaction, import/export

## Run Locally

Open the folder and run a local static server, then open the served URL in your browser.
If you already have this project setup with `run-app.sh`:
```bash
./run-app.sh
