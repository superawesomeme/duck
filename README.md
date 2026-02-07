# Duck Racing Simulator

**Version 0.1**

Developed for Picket Piece Social Club, this is a real-time 3D racing simulation powered by Three.js and WebGL. Features include dynamic water physics, custom event management, and live telemetry tracking.

## Features

* **Real-time 3D Graphics**: Built using Three.js with custom shaders for water effects, fog, and dynamic lighting.
* **Racing Logic**: Simulates 8 ducks racing simultaneously with collision avoidance and variable speeds based on energy cycles.
* **Event Management**: Users can create custom races with unique duck names and event titles, which are saved to local storage.
* **Broadcast UI**: Includes a live leaderboard, track completion telemetry, and speed statistics designed to mimic a TV sports broadcast.
* **Cinematic Camera**: Automatically switches between leader view, pack view, and side angles during the race.
* **Audio**: Features immersive sound effects including river ambience, start signals, and winner announcements.

## Technology Stack

* **Core**: HTML5, CSS3, JavaScript.
* **3D Engine**: Three.js (r128).
* **Model Loading**: GLTFLoader with Draco compression.
* **Fonts**: Google Fonts (Rajdhani, Roboto Condensed).

## Setup and Installation

This application loads external 3D models (`.glb`) and textures, requiring a local web server to bypass CORS restrictions.

### Running Locally

1. Open a terminal in the project directory.
2. Start a local server (e.g., using Python: `python -m http.server`).
3. Access the application via the localhost URL (e.g., `http://localhost:8000`).

## Usage

### Starting a Race

Select a race from the dropdown menu on the start screen to view the lineup, then click "RACE!" to begin.

### Managing Events

1. Click the "MANAGE" button on the start screen.
2. Enter names for all 8 ducks (Red, Orange, Yellow, Green, Blue, Purple, Grey, White).
3. Enter an event name and click "SAVE EVENT" to store it.
4. To restore default settings, use the "Reset all data to defaults" link within the management modal.
