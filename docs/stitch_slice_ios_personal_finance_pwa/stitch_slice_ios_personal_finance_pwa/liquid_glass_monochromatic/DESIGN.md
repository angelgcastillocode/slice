---
name: Liquid Glass Monochromatic
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c7c8'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c6c6c7'
  primary: '#ffffff'
  on-primary: '#2f3131'
  primary-container: '#e2e2e2'
  on-primary-container: '#636565'
  inverse-primary: '#5d5f5f'
  secondary: '#c6c6c9'
  on-secondary: '#2f3033'
  secondary-container: '#4a4b4e'
  on-secondary-container: '#bbbbbe'
  tertiary: '#ffffff'
  on-tertiary: '#303033'
  tertiary-container: '#e4e1e6'
  on-tertiary-container: '#656467'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c7'
  on-primary-fixed: '#1a1c1c'
  on-primary-fixed-variant: '#454747'
  secondary-fixed: '#e2e2e5'
  secondary-fixed-dim: '#c6c6c9'
  on-secondary-fixed: '#1a1c1e'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#e4e1e6'
  tertiary-fixed-dim: '#c8c5ca'
  on-tertiary-fixed: '#1b1b1e'
  on-tertiary-fixed-variant: '#47464a'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  display-hero:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Inter
    fontSize: 38px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.015em
  title-md:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  currency-stat:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.75rem
  margin: 1.25rem
  margin-safe-top: 2.75rem
  margin-safe-bottom: 2.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an ultra-refined, tactile, monochromatic luxury aesthetic tailored for high-precision wealth tracking and financial clarity. Inspired by Apple iOS spatial materials, pure OLED physics, and high-end horology, the interface relies on optical depth, liquid refraction, and deliberate contrast rather than superficial color coding.

### Aesthetic Tone & Personality
- **Architectural & Pure:** True blacks (`#000000`) serve as the foundation, allowing elements to float on deep physical space while conserving battery life on Super Retina displays.
- **Liquid & Tactile:** Elements simulate real optical glass with subtle surface luminosity, soft radial ambient light, and razor-sharp specular borders that catch light at the edges.
- **High-Density Legibility:** Financial metrics demand absolute clarity. Textures are disciplined; typography utilizes strict tabular alignments to make micro-transactions and net-worth shifts effortlessly readable at a glance.

### Design Principles
1. **Material Realism without Skewing:** Surface distinction is created through refraction (`backdrop-filter: blur()`), luminance steps, and inner-border specular highlights (`1px solid rgba(255, 255, 255, 0.15)`), never artificial drop-shadow cutouts.
2. **Monochrome Dominance:** Hierarchy is dictated by light intensity—from luminous White (`#FFFFFF`) down to muted Zinc (`#71717A`). Value changes and spending volumes communicate through geometric scale, line weight, and luminous fills rather than decorative multi-color palettes.
3. **Hardware Integration:** Calibrated to 390×844px baseline screens, honoring iOS Dynamic Island, Home Indicator margins, and hardware gesture zones.

## Colors

The system uses an uncompromising dark-mode palette governed by light transmission and surface tiers. True black anchors the canvas, with zinc-tinted smoke layers providing subtle regional grouping.

### Core Swatches
- **Canvas Base (`neutral`):** `#000000` (Pure OLED Black). Renders true black without gray washing.
- **Primary / Focal Action (`primary`):** `#FFFFFF` (Pure Luminous White). Reserved for active states, high-priority amounts, and primary solid capsule buttons.
- **Secondary / Highlight (`secondary`):** `#E4E4E7` (Polished Silver). Applied to sub-metrics, active icons, and primary pill strokes.
- **Tertiary / Elevated Substrates (`tertiary`):** `#18181B` (Deep Zinc Smoke). Used for elevated base trays, segmented control tracks, and input wells.
- **Secondary Text:** `#A1A1AA` (Muted Zinc). High-legibility neutral for secondary descriptors, time stamps, and labels.
- **Tertiary Text / Inactive States:** `#71717A` (Smoke Tone). Used for placeholders, track borders, and inactive tab icons.

### Liquid Surface Tokens
- **Glass Fill Base:** `rgba(255, 255, 255, 0.06)` combined with `backdrop-filter: blur(24px) saturate(180%)`.
- **Glass Fill Elevated:** `rgba(255, 255, 255, 0.10)` combined with `backdrop-filter: blur(32px) saturate(190%)`.
- **Glass Fill Recessed:** `rgba(18, 18, 21, 0.65)` with `backdrop-filter: blur(20px)`.
- **Specular Hairline (Light Stroke):** Linear gradient from `rgba(255, 255, 255, 0.22)` at the top edge tapering down to `rgba(255, 255, 255, 0.05)` at the bottom edge.
- **Subtle Partition Stroke:** `rgba(255, 255, 255, 0.08)`.

## Typography

Inter serves as the typographic engine, configured to match native Apple SF Pro metrics and micro-typographic proportions.

### Numeric & Tabular Integrity
- All financial balances, timestamps, account identifiers, and data values must apply `font-variant-numeric: tabular-nums lining-nums` or `font-feature-settings: "tnum" 1, "lnum" 1`. This prevents layout shifts during live balance streaming or ticker movements.
- Currency glyphs (`$`, `€`, `£`) share the weight of their parent number but render at 80% scale with a baseline alignment shift to maintain visual symmetry.

### Optical Hierarchy & Rendering
- **Smoothing:** Mandatory `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`.
- **Uppercase Labels:** Small labels (`label-sm`) use uppercase casing accompanied by positive letter spacing (`0.04em`) to establish crisp section separators.

## Layout & Spacing

The layout model is anchored to the native iPhone viewport standard (390×844pt) and runs within a full-bleed Safari PWA framework using `viewport-fit=cover`.

### Grid & Canvas Structure
- **Canvas Base:** Full-width fluid boundary locked to hardware edges, governed by an internal 4-column column system with `16px` (`1rem`) gutters and `20px` (`1.25rem`) screen side margins.
- **Rhythm Engine:** Built on a unified 4pt / 8pt vertical grid. All card paddings, element separators, and stacked metrics adhere to 4px increments.

### Safe Area Enforcement (iOS PWA Safari)
- **Top Safe Area:** `env(safe-area-inset-top, 44px)`. Status bars, balance header actions, and dynamic Island clearance require a fixed `space-lg` buffer beneath the hardware inset.
- **Bottom Safe Area:** `env(safe-area-inset-bottom, 34px)`. Floating liquid tab bars must sit exactly `12px` above the native home indicator zone.
- **Content Scroll Clearance:** Scrollable bodies maintain an obligatory bottom padding of `96px` to ensure zero collision with the floating frosted glass navigation bar.

## Elevation & Depth

Visual hierarchy does not use diffuse black dropshadows. Because the canvas is pure OLED black, depth is created by optical translucency, layered blur intensity, and specular light interaction.

### Elevation Levels

```
Level 0 (Canvas Base)
  └── Pure #000000 background
      └── Subtle ambient radial spotlight at top-center:
          background: radial-gradient(60% 35% at 50% 0%, #18181B 0%, #000000 100%)

Level 1 (Substrate Cards / Containers)
  └── Background: rgba(255, 255, 255, 0.05) to rgba(255, 255, 255, 0.03)
  └── Backdrop Blur: 24px
  └── Top Border: 1px solid rgba(255, 255, 255, 0.18)
  └── Bottom Border: 1px solid rgba(255, 255, 255, 0.04)
  └── Box Shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.8)

Level 2 (Floating Glass / Modals / Active Items)
  └── Background: rgba(255, 255, 255, 0.08)
  └── Backdrop Blur: 32px
  └── Top Border: 1px solid rgba(255, 255, 255, 0.28)
  └── Inner Glow: inset 0 1px 0 0 rgba(255, 255, 255, 0.15)
  └── Box Shadow: 0 12px 36px 0 rgba(0, 0, 0, 0.75)

Level 3 (Overlays / Bottom Sheets / Floating Nav)
  └── Background: rgba(18, 18, 21, 0.82)
  └── Backdrop Blur: 40px
  └── Full Border: 1px solid rgba(255, 255, 255, 0.16)
  └── Top Border Specular: inset 0 1px 0 rgba(255, 255, 255, 0.35)
  └── Box Shadow: 0 -8px 32px rgba(0, 0, 0, 0.9)
```

### Specular Lighting Model
Card top edges catch light simulating a ceiling source. To achieve this in CSS, use:
```css
border: 1px solid transparent;
background-clip: padding-box, border-box;
background-origin: padding-box, border-box;
background-image: 
  linear-gradient(to bottom, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
  linear-gradient(to bottom, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.03) 100%);
```

## Shapes

The interface embraces continuous curvature (iOS squircle geometry) and generous pill profiles, conveying tactile softness that balances the stark monochromatic palette.

### Geometry Values
- **Pill / Capsule (`rounded-full`):** `9999px`. Reserved for primary CTAs, active status chips, dynamic segment indicators, input tags, and the floating tab bar shell.
- **Sheet & Surface Containers (`rounded-xl`):** `28px` to `32px`. Used for bottom sheet modals, high-level portfolio cards, and large spend overview modules.
- **Nested Inner Containers (`rounded-lg`):** `16px` to `20px`. Applied to nested list items, transaction groups, and chart containers.
- **Controls & Form Elements:** `12px` to `14px` for input wells, segmented button options, and interactive toggles.
- **Continuous Smoothing:** When using native frameworks or modern WebKit builds, declare `corner-smoothing: 60%` (iOS continuous curvature equivalent).

## Components

### 1. Capsule Buttons
- **Primary Action (High-Contrast Solid):**
  - Height: `52px` | Border-radius: `9999px` (Pill).
  - Background: `#FFFFFF` | Text: `#000000` (Inter Medium, 16px).
  - Shadow: `0 4px 14px rgba(255, 255, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 1)`.
  - Active Press State: `transform: scale(0.97); opacity: 0.92; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1)`.
- **Secondary Action (Liquid Glass Pill):**
  - Height: `52px` | Border-radius: `9999px`.
  - Background: `rgba(255, 255, 255, 0.08)` | Backdrop-filter: `blur(20px)`.
  - Border: `1px solid rgba(255, 255, 255, 0.16)`.
  - Text: `#FFFFFF` | Inset Top Highlight: `inset 0 1px 0 rgba(255, 255, 255, 0.20)`.
  - Active Press State: `background: rgba(255, 255, 255, 0.14); transform: scale(0.97)`.

### 2. Cards & Portfolio Wells
- **Liquid Glass Metric Card:**
  - Border radius: `28px` | Padding: `20px`.
  - Background: `rgba(255, 255, 255, 0.05)` | Filter: `blur(28px)`.
  - Border: Top gradient `rgba(255,255,255,0.22)` to bottom `rgba(255,255,255,0.04)`.
  - Visual hierarchy: Uppercase micro-label (`label-sm`) at top in `#A1A1AA`, followed by tabular balance headline in `#FFFFFF`, with 24-hour delta badge styled in translucent glass.

### 3. Native iOS Liquid Toggle (Switch)
- Track: Width `51px`, Height `31px`, Border radius `9999px`.
  - Off: `rgba(255, 255, 255, 0.12)` with `1px solid rgba(255, 255, 255, 0.08)`.
  - On: `#FFFFFF` (Monochrome high-key on state).
- Knob: Diameter `27px`, circular (`border-radius: 50%`).
  - Off: `#FFFFFF` with drop shadow `0 3px 8px rgba(0, 0, 0, 0.4)`.
  - On: `#000000` with subtle internal reflection.
  - Motion: `cubic-bezier(0.175, 0.885, 0.32, 1.275)` snap transition.

### 4. Floating Liquid Navigation Bar
- Dimensions: Width `calc(100% - 48px)`, Height `64px`, fixed position.
- Margin: Left/Right `24px`, Bottom: `calc(env(safe-area-inset-bottom, 34px) + 8px)`.
- Material: Background `rgba(18, 18, 21, 0.72)` with `backdrop-filter: blur(36px) saturate(180%)`.
- Outline: `1px solid rgba(255, 255, 255, 0.16)`, top specular line `rgba(255, 255, 255, 0.3)`.
- Pill Form: `border-radius: 9999px`.
- Icons: Active item in `#FFFFFF` with illuminated radial glow underneath; inactive items in `#71717A`.

### 5. Transaction List Row
- Layout: 2-column flex item, height `64px`, vertical align center.
- Icon Base: `40px` squircle container, background `rgba(255, 255, 255, 0.06)`, border `1px solid rgba(255, 255, 255, 0.1)`.
- Left Side: Entity name (`title-md` in `#FFFFFF`) stacked above categorization and timestamp (`label-md` in `#A1A1AA`).
- Right Side: Numeric value with tabular numerals (`body-lg`, weight `600`, color `#FFFFFF`), subtext indicating clearing status.
- Separator: `1px` line starting from icon end margin, color `rgba(255, 255, 255, 0.06)`.

### 6. Liquid Bottom Sheet
- Drag Handle: Width `36px`, Height `5px`, background `rgba(255, 255, 255, 0.3)`, radius `9999px`, margin `10px auto 16px`.
- Body: Radius top-left/right `32px`.
- Material: `rgba(15, 15, 18, 0.94)`, backdrop blur `40px`, border-top `1px solid rgba(255, 255, 255, 0.25)`.
- Inset Padding: Horizontal `20px`, Bottom `calc(env(safe-area-inset-bottom) + 20px)`.

### 7. Form Input Wells
- Container: Height `54px`, radius `14px`.
- Background: `rgba(255, 255, 255, 0.04)`, border `1px solid rgba(255, 255, 255, 0.1)`.
- Focus State: Border `1px solid rgba(255, 255, 255, 0.45)`, ambient inner shadow `inset 0 0 12px rgba(255, 255, 255, 0.04)`.
- Typography: Tabular numeric input, `#FFFFFF`, caret color `#FFFFFF`.