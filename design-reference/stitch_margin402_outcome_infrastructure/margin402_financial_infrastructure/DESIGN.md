---
name: Margin402 Financial Infrastructure
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#006d30'
  on-secondary: '#ffffff'
  secondary-container: '#92f5a4'
  on-secondary-container: '#007233'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#331200'
  on-tertiary-container: '#cf6721'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#95f8a7'
  secondary-fixed-dim: '#79db8d'
  on-secondary-fixed: '#00210a'
  on-secondary-fixed-variant: '#005323'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-price:
    fontFamily: Geist
    fontSize: 72px
    fontWeight: '600'
    lineHeight: 80px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  data-tabular:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-xs:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system is rooted in a **Precision Minimalist** aesthetic, tailored for the intersection of high-frequency autonomous finance and developer-centric infrastructure. The personality is "Quiet Intelligence"—it avoids loud marketing flourishes in favor of extreme clarity, technical density, and institutional trust.

The visual language borrows from the "New Fintech" movement (Stripe, Vercel), emphasizing:
- **Spatial Rigor:** Exceptional use of whitespace to separate high-value financial data.
- **Architectural Clarity:** Information hierarchy driven by scale and typography rather than decorative elements.
- **Trust through Precision:** Hairline borders and monospaced data sets reflect the accuracy required for autonomous margin trading and agent-led transactions.

## Colors

The palette is intentionally restrained to ensure that status indicators (Green/Amber/Red) carry maximum semantic weight without overwhelming the user interface.

- **Backgrounds:** Use the warm off-white (`#F9F8F6`) for the global application background to reduce eye strain. Reserve pure white (`#FFFFFF`) for interactive surfaces and containers.
- **Typography:** The primary text uses a near-black for high contrast, while secondary text uses a muted neutral gray to create a clear informational hierarchy.
- **Status Colors:** These are used sparingly. Only apply forest green, amber, or muted red to active data states, margin health indicators, or critical alerts.

## Typography

The system utilizes **Geist** for its neutral, technical grotesque qualities, ensuring the UI feels modern and systematic. 

**Numerical Data & Financials:** 
All prices, margin percentages, and transaction hashes must use **JetBrains Mono**. This ensures that vertical columns of numbers align perfectly (tabular figures), allowing agents and human operators to scan for fluctuations rapidly.

**Hierarchy Rules:**
- Use `display-price` for hero margin values and real-time asset pricing.
- Use `label-xs` in uppercase for table headers and small metadata tags.
- Apply a tighter letter-spacing for large headlines to maintain a "premium" feel.

## Layout & Spacing

The layout is governed by a **Fixed Grid** system for dashboard environments and a **Fluid Content Area** for documentation or technical logs.

- **Grid:** Use a 12-column grid for desktop with 24px gutters. Content should be centered with a maximum width of 1440px.
- **Rhythm:** Spacing follows a 4px baseline. Use `lg` (40px) and `xl` (64px) for vertical section breathing room to maintain the "premium" airy feel.
- **Mobile:** Transition to a 4-column grid with 16px margins. High-density data tables should allow for horizontal overflow scrolling rather than stack-reflow to preserve data relationship integrity.

## Elevation & Depth

This design system avoids traditional drop shadows to maintain a flat, "engineered" aesthetic. Depth is achieved through **Tonal Layering** and **Hairline Outlines**:

- **Level 0 (Background):** Warm off-white (`#F9F8F6`).
- **Level 1 (Cards/Surfaces):** Pure white (`#FFFFFF`) with a 1px solid border (`#E5E5E1`). No shadow.
- **Level 2 (Dropdowns/Modals):** Pure white with a slightly darker 1px border (`#D1D1CC`) and an ultra-diffused, 4% opacity neutral shadow (0px 4px 20px) to indicate interaction.
- **Active States:** Subtle 1px inset borders represent "pressed" or "active" states for buttons and inputs.

## Shapes

The shape language is disciplined and geometric. 
- **Small Components:** Checkboxes, tags, and small buttons use a 4px (`rounded-sm`) radius.
- **Large Components:** Main dashboard cards and modal containers use an 8px (`rounded-lg`) radius.
- **Strictness:** Avoid pill-shaped elements (except for specific status chips) to maintain the professional, structured look.

## Components

### Buttons
- **Primary:** Solid `#111111` fill with white text. Hover state shifts to `#333333`.
- **Secondary:** White fill with 1px `#E5E5E1` border. Hover state applies a very light gray background (`#F9F8F6`).
- **Typography:** Always use `body-md` weight 500 for button labels.

### Cards
- White background, 1px `#E5E5E1` border, 8px corner radius.
- Padding should be generous (24px or 32px) to prevent data density from feeling cluttered.

### Input Fields
- Understated styling: 1px border, 4px radius. 
- Focus state: Border color changes to `#111111` (black) with no outer glow.
- Use monospaced font for inputs requiring numerical values.

### Data Tables
- Header row: `label-xs` with a subtle bottom border.
- Row hover: Apply a background fill of `#F9F8F6` to indicate selection.
- Alignment: Numbers are always right-aligned; text is left-aligned.

### Motion & Interaction
- **Page Transitions:** 400ms ease-out horizontal slide (right-to-left) for forward navigation.
- **Entrance:** Vertical "fade-in-up" for list items, staggered by 50ms per item.
- **Precision:** All transitions must be snappy to reflect the speed of autonomous infrastructure.