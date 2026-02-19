# Cyber Cruisers — Game Design Document

> Version 0.1 — Living Document | Last Updated: 2026-02-19

---

## Table of Contents

1. [Vision & Core Pillars](#1-vision--core-pillars)
2. [Platform & Technical Constraints](#2-platform--technical-constraints)
3. [Art Direction](#3-art-direction)
4. [Controls](#4-controls)
5. [Core Gameplay Loop](#5-core-gameplay-loop)
6. [City & World Design](#6-city--world-design)
7. [Vehicle System](#7-vehicle-system)
8. [Job System](#8-job-system)
9. [Company Rank System](#9-company-rank-system)
10. [Economy & Progression](#10-economy--progression)
11. [UI/UX — The Diegetic Phone](#11-uiux--the-diegetic-phone)
12. [Audio Direction](#12-audio-direction)
13. [Technical Architecture](#13-technical-architecture)
14. [Milestone Plan](#14-milestone-plan)
15. [Open Questions & Decisions Log](#15-open-questions--decisions-log)

---

## 1. Vision & Core Pillars

### Elevator Pitch

Cyber Cruisers is a satisfying and at-times-relaxing mobile driving sim set in a vast, rain-soaked cyberpunk city. You pilot a Cruiser — a flying car in the tradition of Blade Runner — through a neon-lit aerial road network, choosing jobs that match your playstyle and upgrading your vehicle to unlock higher-value contracts.

### Core Pillars

| Pillar | Description |
|---|---|
| **Satisfying flow** | Movement feels smooth and responsive. Lane changes and turns are crisp. Every run through the city has rhythm. |
| **Player agency** | You choose what type of work you do and what kind of Cruiser you become. No forced path. |
| **Living world** | The city feels inhabited and believable — traffic, lit windows, weather, day/night cycle. |
| **Cozy progression** | No failure states from crashes (autopilot catches you). Progress is always forward. Relaxing when you want it, intense when you take high-stakes jobs. |
| **Deep customization** | Vehicles are a canvas. Livery designs, color layers, and functional upgrades create meaningful identity. |

---

## 2. Platform & Technical Constraints

- **Target platform:** Mobile browser (portrait orientation)
- **Reference resolution:** Samsung Galaxy S23 Ultra — 1440 × 3088 px native; target a logical canvas at **360 × 780** (4× upscale for pixel art crispness at native res)
- **Orientation:** Portrait only
- **Input:** Touch — swipe gestures, taps
- **Performance target:** 60 fps on mid-range Android/iOS hardware (2021+)
- **Offline capable:** Service worker caching; core gameplay must work without network
- **Save system:** localStorage + optional cloud sync (future)
- **No app store required:** Installable as PWA

---

## 3. Art Direction

### Style Summary

**Retro-futurist cyberpunk pixel art.** Think Blade Runner 2049 colour grading + 16-bit SNES-era sprite fidelity, viewed from directly overhead (true top-down).

### Perspective

- **True top-down 2D** — you look straight down on the aerial road network
- Buildings are extruded upward toward the camera: rooftops dominate, edges show building sides fading into darkness below
- **Parallax layers** (front-to-back, varying by heading direction) simulate altitude and depth:
  - Layer 0 (fastest scroll): rain/atmosphere FX
  - Layer 1: Cruiser + aerial road markings
  - Layer 2 (road plane): lane lines, floating streetlights, air traffic signs
  - Layer 3: Rooftop level — rooftop gardens, signage, HVAC, landing pads
  - Layer 4 (slow): Upper building facades — neon signs, windows
  - Layer 5 (slowest): Deep building facades + ground level glow (barely visible, deep below)
- Parallax direction and speed shift when turning to reinforce the sensation of banking

### Pixel Art Spec

- **Base tile size:** 16 × 16 px
- **Sprite scale:** 4× CSS pixel scale to logical canvas
- **Colour palette:** Per-district palettes, all derived from a master cyberpunk palette (deep blues, magentas, amber, acid green, off-white neon)
- **Normal maps:** Each tile and sprite ships with a normal map for real-time dynamic lighting
- **Lighting:** WebGL fragment shader — point lights from headlights, neon signs, streetlights; ambient is near-black at night

### Lighting Model

- Headlights cast forward cone, bounce off wet road surface (specular highlight)
- Neon signs pulse at different frequencies; each is a point light with colour matching sign colour
- Floating streetlights at lane boundaries — warm amber or cool blue depending on district
- Rain = additive particle layer that catches light sources
- Day/night cycle changes ambient from warm daylight to near-black night over real time (accelerated in-game)

### Districts (Visual Themes)

| District | Palette | Feel |
|---|---|---|
| Neon Commercial | Magenta + cyan | Blade Runner downtown, dense signage |
| Industrial Port | Amber + rust | Warehouses, cargo rigs, fog |
| Residential Stack | Muted blue + warm windows | Dense residential towers, quieter |
| Corp Arcology | White + electric blue | Clean, cold, megacorp towers |
| Outer Ring | Green + brown | Decay, sparse, lower altitude cap |

---

## 4. Controls

### Philosophy

Cardinal-direction flight + swipe-to-change-lane. Inspired by Pac-Man (fixed cardinal movement, no diagonal) and Temple Run (swipe language as core vocabulary).

### Movement Model

- The Cruiser always flies in one of four cardinal directions: **North, South, East, West**
- Speed is constant within a run (modified by vehicle class and upgrades); the player does not control throttle directly
- The world scrolls under the Cruiser; the Cruiser stays near the vertical center of screen

### Swipe Gestures

| Gesture | Action |
|---|---|
| Swipe Left | Move one lane left (relative to heading) |
| Swipe Right | Move one lane right (relative to heading) |
| Swipe in heading direction | Boost (if equipped) |
| Swipe opposite to heading | Brake / decelerate (for docking) |
| Tap phone button (HUD) | Open diegetic phone |
| Long press | Activate autopilot (hands-free cruising) |

### Lane System

- Roads are composed of **N lanes** (varies by road type: 2–6 lanes)
- Lanes are numbered left-to-right relative to heading direction
- **Turning lanes** exist at intersections — entering one automatically queues a direction change that executes when the intersection is reached
- **Exit lanes** (rightmost or leftmost, marked) lead into Points of Interest (POIs): garages, restaurants, warehouses, etc.
- **Autopilot** prevents collisions but will not change lanes or turn for you; it brakes for traffic

### Traffic

- AI Cruisers share the lanes; density varies by district and time of day
- AI obeys lane rules; some (NPCs with personality) do not — aggressive drivers, distracted couriers, etc.
- Player must lane-change to navigate around slower traffic (satisfying flow incentive)
- Some jobs require you to keep pace with a specific NPC (escort missions)

---

## 5. Core Gameplay Loop

```
[Open Phone] → [Accept Job] → [Fly to Pickup] → [Collect] → [Fly to Dropoff] → [Complete Job]
       ↓                                                                               ↓
  [Browse Jobs]                                                              [Earn Credits + XP]
  [Browse Shops]                                                                      ↓
  [Check Rank]                                                          [Upgrade / Buy / Customize]
                                                                                      ↓
                                                                         [Unlock Better Jobs]
```

### Session Flow

1. Player starts in their **hangar** (safe zone, no traffic) — opens phone
2. Browses available jobs from contracted companies (or walk-ins)
3. Accepts a job → destination marker appears on mini-map
4. Flies city streets to pickup location → enters POI lane to dock
5. Completes pickup interaction (brief animation; no mini-game unless job type calls for it)
6. Flies to dropoff → docks → job complete
7. Earns Credits + Company XP
8. Returns to hangar or accepts another job immediately

### Tension Levers

- Time-sensitive jobs (delivery timer) — pays more, but penalizes late delivery
- Traffic density (rush hour vs. off-peak)
- Weather effects (rain reduces visibility; storms affect handling)
- High-value cargo that makes you visible to other city actors (future: rival couriers, city enforcement)

---

## 6. City & World Design

### Structure

The city is procedurally assembled from **modular district tiles** at session start, seeded consistently so the map feels persistent. The full city is large — the player discovers it over time.

### Road Network

- Aerial roads follow a grid with occasional diagonal connectors
- Multiple altitude layers exist (low, mid, high) — different companies operate at different altitude tiers
- Altitude is a future expansion axis; MVP focuses on a single altitude plane

### POI Categories

| Category | Examples | Interaction |
|---|---|---|
| **Hangar** | Player home base | Start/end sessions, park Cruisers |
| **Dealership** | Different brands per district | Browse & buy Cruisers via phone |
| **Upgrade Garage** | Specialized by upgrade type | Install purchased upgrades |
| **Paint Shop** | Custom livery + colour | Customize appearance |
| **Repair Garage** | General repairs | Fix cosmetic damage, restore condition |
| **Warehouse** | Megacorp distribution hubs | Cargo delivery job source |
| **Restaurant / Grocer** | Individual vendors | Food delivery job pickup points |
| **Residential Tower** | Apartment blocks | Taxi dropoffs, package deliveries |
| **Corp Tower** | Megacorp HQ | High-value client pickups/dropoffs |
| **Enforcement Station** | City air traffic control | Future: fines, impound |

### Building Generation

- **Modular tile sets** per district — rooftop, facade, signage tiles mix and match
- Buildings are recolourable: base sprite + palette swap overlay
- POIs share base building types but have **unique signage, landing pad markings, and colour accent** that make them identifiable
- Points of interest are hand-placed anchors; filler buildings are procedurally selected from district tile pools

### Mini-Map

- Persistent in corner of HUD
- Shows current road network, active job marker, player position, POIs discovered so far
- Undiscovered areas shown as dark/fog

---

## 7. Vehicle System

### Cruiser Classes

| Class | Profile | Best For |
|---|---|---|
| **Compact** | Small, fast, low cargo cap | Taxi, food delivery, packages |
| **Courier** | Mid-size, balanced | General all-rounder, starter class |
| **Freight** | Large, slow, high cargo cap | Bulk warehouse runs |
| **Luxury** | Fast, sleek, low cargo | High-profile taxi, VIP escort |
| **Tow Rig** | Specialized, wide | Recovery/towing jobs |

### Vehicle Stats

- **Speed** — top cruising speed
- **Handling** — lane-change responsiveness
- **Cargo Capacity** — max load (weight / volume)
- **Durability** — cosmetic damage resistance
- **Stealth** — visibility to enforcers (future)
- **Reputation** — affects which clients will hire you (luxury clients won't take a beaten-up freight rig)

### Upgrades

Upgrades are purchased at appropriate garages. They slot into upgrade categories:

| Slot | Examples |
|---|---|
| **Engine** | Speed tier upgrades |
| **Handling** | Tighter lane changes, better wet-weather response |
| **Cargo Bay** | Extended capacity, temperature control, secure lock |
| **Autopilot** | Better collision avoidance, auto-lane-keep |
| **Cosmetic** | Lighting kits, body kits, exhaust vents |
| **Company Mod** | Branded mods unlocked via company rank (job-type specific) |

### Visual Customization

- **Livery system:** Each Cruiser has a multi-layer sprite:
  1. Body base colour (HSL shift)
  2. Livery pattern (unlockable designs — company brands, abstract, retro, etc.)
  3. Livery accent colour (HSL shift, independent of base)
  4. Detail colour (trim, lights, etc.)
  5. Damage/wear overlay (cosmetic, grows with use unless repaired)
- Liveries are unlocked via: purchase at paint shop, company rank rewards, in-game events

---

## 8. Job System

### Job Types

| Type | Company Archetype | Mechanic | Payout Profile |
|---|---|---|---|
| **Package Delivery** | Megacorp warehouse (e.g. "OmniEx") | Pick up cargo → deliver to address | Steady, low variance |
| **Bulk Freight** | Megacorp warehouse | Multiple stops or heavy single load | Slow but high volume pay |
| **Food Delivery** | Gig platform (e.g. "NoodleRun") | Restaurant pickup → residential dropoff | Fast, tip-based variance |
| **Taxi / Ride** | Ride platform (e.g. "AirFare") | Pick up NPC client → dropoff | Scales with distance + rating |
| **VIP Transport** | Luxury agency | Pick up high-rep client → escort safely | High pay, time sensitive |
| **Towing** | Recovery service | Locate broken-down Cruiser → tow to garage | Navigational challenge |
| **Getaway Assist** | Shady broker (grey market) | Time-critical extraction run | High risk, high reward |

### Job Selection (Phone App)

- Each company has its own phone app with its own UI aesthetic
- Jobs list: name, pickup location, dropoff, time limit (if any), payout, company XP reward
- Sorting: by payout, by distance, by XP, by time limit
- Jobs refresh periodically; taking too long means a job disappears (claimed by another courier NPC)

### Job Execution Flow

1. **Accept** — job marker appears on mini-map
2. **Transit to pickup** — navigate city, manage traffic
3. **Dock at pickup POI** — enter exit lane, slow to dock speed, brief dock animation
4. **Load / collect** — phone shows "Cargo Loaded" or "Client Aboard"
5. **Transit to dropoff**
6. **Dock at dropoff POI**
7. **Complete** — payout screen (credits earned, XP earned, time bonus if applicable, tip if taxi)

### Time Sensitivity Tiers

| Tier | Modifier | Penalty |
|---|---|---|
| No timer | Baseline pay | None |
| Generous window | +10% pay | None if late; small XP penalty |
| Rush | +25% pay | Pay reduced proportionally if late |
| Priority | +50% pay | Full forfeit if missed |

---

## 9. Company Rank System

### Structure

Each company has an independent rank ladder (5 ranks).

| Rank | Name Example | Unlock |
|---|---|---|
| 1 | Associate | Basic jobs, basic company livery |
| 2 | Courier | Mid-tier jobs, company paint colour |
| 3 | Specialist | High-value jobs, branded upgrade mod |
| 4 | Senior | Priority contracts, exclusive livery |
| 5 | Partner | Top-tier jobs, unique vehicle unlock |

### XP & Rank Up

- Company XP earned per job — some jobs give more XP than credits (relationship-building jobs)
- Rank up triggers a brief celebratory notification via the phone app with unlock reveal
- Ranks are permanent — they don't decay

### Cross-Company Dynamics

- Ranking highly with one company may unlock jobs that reference another (city is interconnected)
- Some companies are rival factions — ranking with one may lock certain rank 4/5 jobs with another (future: faction choice)

---

## 10. Economy & Progression

### Currency

- **Credits (₵)** — primary currency; earned from jobs, spent on vehicles/upgrades/customization
- No premium currency in MVP; cosmetics are earned or purchased with Credits

### Pricing (Indicative, tuning required)

| Item | Credit Range |
|---|---|
| Entry Cruiser (Compact) | ₵500–₵1,500 |
| Engine upgrade (tier 1) | ₵200–₵400 |
| Paint / Livery | ₵50–₵300 |
| Luxury Cruiser | ₵8,000–₵20,000 |
| Freight Cruiser | ₵5,000–₵12,000 |

### Job Payout (Indicative)

| Job Type | Payout Range |
|---|---|
| Food delivery | ₵15–₵60 |
| Package (standard) | ₵30–₵80 |
| Bulk freight | ₵120–₵400 |
| Taxi ride | ₵25–₵100 |
| VIP transport | ₵200–₵600 |
| Towing | ₵80–₵200 |

### Progression Curve

- Early: Starter Courier, basic jobs, building first rank with 1–2 companies
- Mid: Second Cruiser purchase (specialist), branching into preferred job type
- Late: High-rank contracts, fleet of specialized Cruisers, full city map discovered

---

## 11. UI/UX — The Diegetic Phone

### Concept

All menu interaction happens through an in-world phone. The player's character uses this phone while parked or while autopilot is active. The phone is a physical object in the game world with its own aesthetic.

### Phone Aesthetic

- Holographic display projecting from a wrist-mounted device or dashboard slot
- UI rendered in a retro-future operating system style — monospace fonts, scanlines, glowing accent borders
- Each company app has its own branded UI skin within the phone

### Phone Apps

| App | Function |
|---|---|
| **JobBoard** (company-specific) | Browse and accept jobs per company |
| **Map** | Full city map, discovered POIs, waypoint setting |
| **Garage** | View installed upgrades; link to nearby garages |
| **Showroom** | Browse available Cruisers at nearby dealerships |
| **Livery Studio** | Customize vehicle appearance |
| **Messages** | Story beats, company notifications, tips from NPCs |
| **Credits Wallet** | Balance, transaction history |
| **Settings** | Audio, display, control sensitivity |

### HUD (Always Visible)

- Mini-map (corner)
- Speed indicator (small, subtle)
- Active job status bar (pickup/dropoff, timer if applicable)
- Phone button (tap to open phone)
- Autopilot indicator (glow when active)

### Accessibility

- High contrast mode
- Haptic feedback on lane changes and docking
- Configurable swipe sensitivity
- Pause available anytime via phone

---

## 12. Audio Direction

- **Music:** Synthwave / dark ambient — procedurally layered. City districts modulate which layers are prominent. Night vs. day shifts tone.
- **SFX:** Cruiser engine hum (pitch varies with speed), lane-change whoosh, docking clunk, phone notification chime, rain ambience, distant city sounds
- **Adaptive audio:** Music intensity rises during time-sensitive jobs; calms in hangar
- **No voice acting in MVP**

---

## 13. Technical Architecture

### Candidate Engine: Phaser 3 (Recommended)

**Why Phaser 3:**
- Mature HTML5 game framework, WebGL renderer with Canvas fallback
- Excellent tilemap support (Tiled editor integration)
- Built-in mobile touch input
- Active community, good documentation
- Supports custom GLSL shaders (normal map lighting pipeline feasible)
- Outputs as static HTML/JS — trivially served as PWA

**Alternatives considered:**
- Godot (HTML5 export): Heavier bundle, less control over shader pipeline
- PixiJS (raw): More control, more boilerplate; viable if Phaser proves limiting
- Unity WebGL: Too heavy for mobile browser

### Rendering Pipeline

```
WebGL Renderer
├── Background layers (parallax, per-heading offset)
│   ├── Atmosphere / rain (additive blend)
│   ├── Deep building facades (slowest parallax)
│   ├── Upper building facades + neon signs
│   └── Rooftop level
├── Road plane (tilemap)
│   ├── Lane markings
│   ├── Floating streetlights (point light sources)
│   └── Traffic AI sprites
├── Player Cruiser (multi-layer sprite)
└── HUD overlay (Canvas 2D or separate WebGL pass)

Lighting shader:
- Normal map sampler per layer
- Point light array (headlights, signs, streetlights)
- Ambient colour uniform (driven by time-of-day)
```

### Project Structure (Proposed)

```
/src
  /scenes         — Phaser scenes (Boot, Preload, MainMenu, Game, Hangar, Phone)
  /systems        — Game systems (traffic, jobs, economy, city gen)
  /entities       — Game objects (Cruiser, NPC, POI, Building)
  /ui             — Phone UI components
  /shaders        — GLSL shader files (lighting, rain, parallax)
  /data           — JSON data (vehicle stats, job templates, company defs, upgrade defs)
  /assets
    /sprites       — Pixel art sprites + normal maps
    /tilemaps      — Tiled map files + tilesets
    /audio
    /fonts
/public           — Static serving root (index.html, manifest.json, SW)
```

### Data-Driven Design

- Vehicles, upgrades, companies, job templates, POI types defined in JSON
- Enables rapid tuning without code changes
- Future: server-side content updates without app update

---

## 14. Milestone Plan

### Milestone 0 — Foundation (Tech Spike)
**Goal:** Validate the rendering and control architecture. Nothing is final; everything is throwaway.

- [ ] Project scaffold: Phaser 3 + Vite + PWA manifest
- [ ] Portrait canvas at target resolution with pixel-perfect scaling
- [ ] Basic tilemap rendering (placeholder tiles)
- [ ] Cruiser sprite moving in cardinal directions with swipe input
- [ ] Lane system: N lanes, swipe left/right to change lane
- [ ] Turning lane: entering queues a direction change at next intersection
- [ ] Basic parallax layer setup (3 layers minimum, direction-reactive)
- [ ] Normal map lighting shader proof-of-concept (headlights)

**Exit criteria:** A Cruiser navigates a hand-built test map via swipe controls with parallax and basic lighting. Runs at 60fps on target hardware.

---

### Milestone 1 — Core Loop (Playable Prototype)
**Goal:** First complete job from accept → complete, with real economy tracking. World scale, movement feel, and visual layers must be dialled in before systems are built on top.

**Feel & Foundation (must be right first)**
- [ ] World scale: tune block size, road length, and lane width so the city reads as vast but navigable
- [ ] Cruiser scale: player sprite size relative to road width feels correct (not too large, not toy-tiny)
- [ ] Player movement: fine-tune cruise speed, acceleration curve, lane-change timing, and turn responsiveness until driving feels satisfying
- [ ] Parallax layers: verify all 3 scroll layers (buildings, road plane, rain) move correctly in every heading; fix any pop or axis mismatch
- [ ] Docking design: define and prototype how the player stops at a POI — approach speed, snap zone size, visual cue, confirmation feedback
- [ ] General look & feel pass: colour palette, contrast, readability of roads vs buildings; not final art, but must be coherent

**Core Loop**
- [ ] City generator: district tile pools, POI anchor placement
- [ ] Mini-map with player position + job markers
- [ ] Diegetic phone: shell app with one company's job board
- [ ] One job type (Package Delivery) fully implemented
- [ ] Pickup and dropoff docking mechanics
- [ ] Credits economy (earn, display balance)
- [ ] One company rank ladder (5 ranks, XP tracking)
- [ ] Autopilot (collision prevention, no lane changes)
- [ ] Basic AI traffic (same-direction lane followers)
- [ ] HUD elements (speed, job bar, mini-map, phone button)
- [ ] Day/night cycle (ambient light shift)
- [ ] Basic audio: engine hum, lane-change SFX, notification chime

**Exit criteria:** A full session — accept job, fly across a generated city, dock, complete, earn credits, rank up — is satisfying and stable. Driving and world scale feel right independent of the job loop.

---

### Milestone 2 — Vehicle & Garage System
**Goal:** Meaningful vehicle identity and upgrade loop.

- [ ] 3 vehicle classes implemented (Compact, Courier, Freight)
- [ ] Vehicle stats system (speed, handling, cargo cap)
- [ ] Upgrade system: 3 upgrade slot types, 2 tiers each
- [ ] Upgrade Garage POI: browse and install upgrades via phone
- [ ] Dealership POI: browse and buy vehicles via phone
- [ ] Livery system: base colour + 1 pattern layer + accent colour
- [ ] Paint Shop POI: livery customisation UI
- [ ] Hangar: park multiple Cruisers, switch active vehicle
- [ ] Repair Garage POI: cosmetic damage repair

**Exit criteria:** Player buys a second Cruiser, upgrades it, repaints it, and uses it for jobs. Visible stat differences are felt during play.

---

### Milestone 3 — Job Diversity
**Goal:** All major job types implemented. Player has meaningful career choices.

- [ ] Food Delivery job type (NoodleRun app)
- [ ] Taxi / Ride job type (AirFare app)
- [ ] Bulk Freight job type (OmniEx)
- [ ] Towing job type (Recovery app)
- [ ] VIP Transport job type (Luxury agency app)
- [ ] Time sensitivity tiers + payout calculation
- [ ] Job rating / tip system (taxi / VIP)
- [ ] Company rank system for all 5 companies
- [ ] Company rank unlock rewards (liveries, company mods)

**Exit criteria:** Player spends a session specializing in one job type, reaches rank 3 with a company, and earns a company-branded livery.

---

### Milestone 4 — City Aliveness
**Goal:** The city feels lived in. The world has texture and personality.

- [ ] 5 districts with distinct palettes and tile sets
- [ ] Full parallax system (all 5 layers, direction-reactive)
- [ ] Neon sign lighting (per-sign point lights, pulse variation)
- [ ] Floating streetlights at lane boundaries
- [ ] Rain particle system with light interaction
- [ ] AI traffic with basic personality variance (aggressive, slow, distracted)
- [ ] NPC Cruiser visual variety (different sprites per class)
- [ ] Time of day cycle with real lighting shifts
- [ ] Ambient city audio (district-specific, day/night variants)
- [ ] Adaptive music system

**Exit criteria:** A first-time viewer watching gameplay recognises the Blade Runner aesthetic without being told the reference.

---

### Milestone 5 — Polish & PWA Launch
**Goal:** Shippable v1.0. Stable, performant, installable.

- [ ] Full city map (all districts connected)
- [ ] Fog of war / map discovery
- [ ] Onboarding flow (first run tutorial via phone messages)
- [ ] Save/load (localStorage)
- [ ] PWA: installable, offline play for core loop
- [ ] Performance pass: 60fps on mid-range 2021 Android
- [ ] Accessibility: high contrast, haptics, swipe sensitivity
- [ ] Audio mix pass
- [ ] All placeholder art replaced with final pixel art
- [ ] Bug bash and balance pass

**Exit criteria:** Game is installable as a PWA, full core loop is playable offline, no critical bugs, average session length > 10 minutes in internal testing.

---

### Post-Launch Backlog (Future Milestones)

- Multiple altitude lanes (low/mid/high city tiers)
- Weather events (storms, low visibility)
- Rival courier NPCs (compete for jobs)
- Faction system (conflicting company allegiances)
- Story mode (phone message narrative, key NPCs)
- Seasonal events
- Leaderboards (optional, server-side)
- Additional vehicle classes (Tow Rig, Stealth)
- Additional districts

---

## 15. Open Questions & Decisions Log

| # | Question | Status | Decision |
|---|---|---|---|
| 1 | Engine: Phaser 3 vs PixiJS vs Godot? | **Decided** | Phaser 3 + Vite |
| 2 | Normal map lighting: custom GLSL in Phaser vs deferred pipeline? | Open | — |
| 3 | City generation: seed-based procedural vs hand-authored per district? | **Decided** | Seeded procedural — fixed seed, same city every run |
| 4 | Is the Getaway job type in scope for M3, or post-launch? | **Decided** | Post-launch |
| 5 | Monetisation model (Credits only vs cosmetic IAP)? | **Decided** | Credits only for v1; no premium currency |
| 6 | Single hangar or multiple garages player can own? | Open | — |
| 7 | Collision with traffic: cosmetic only (damage), or gameplay penalty? | **Decided** | No collision — Cruisers auto-accelerate and use forward raycasts (ADAS-style braking) to avoid contact entirely. Controls: hold L/R zone to merge lanes; dedicated brake button for docking |
| 8 | Do NPCs react to player (horn, brake lights)? | Open | — |

---

*This document is a starting point. Sections will be refined, split, and updated as development progresses. Each milestone's scope may shift based on what we learn building.*
