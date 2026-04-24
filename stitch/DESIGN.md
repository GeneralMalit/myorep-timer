# Design System Strategy: Kinetic Cyber-Athleticism

## 1. Overview & Creative North Star
This design system is built for the "High-Performance Architect." The Creative North Star is **Kinetic Precision**. 

Unlike standard fitness apps that focus on soft curves and calming gradients, this system adopts an aggressive, technical aesthetic rooted in data-driven performance. We move away from generic "card-on-background" layouts by utilizing a node-based architecture and intentional asymmetry. The UI should feel like a cockpit for an elite athlete—authoritative, high-contrast, and deeply immersive. We achieve a "custom" feel by leaning into bold italicized typography and high-density information clusters that prioritize speed of recognition over decorative whitespace.

## 2. Colors & Surface Logic
The palette is a high-contrast interaction between "Total Darkness" and "Vibrant Energy."

### The Palette
- **Primary Action:** `#8B5CF6` (Vibrant Purple) - Used for critical system triggers.
- **Accents:** `secondary` (`#c7f300`) - Used for success states and performance peaks.
- **Neutrals:** A spectrum of deep grays ranging from `surface` (`#0e0e0f`) to `surface-container-highest` (`#262627`).

### The "No-Line" Rule
Explicitly prohibit 1px solid borders for sectioning. Structural definition must be achieved through:
1.  **Tonal Shifts:** Placing a `surface-container-low` section against the `background` to create a logical break.
2.  **Negative Space:** Using the spacing scale to group related functional nodes.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of technical components.
- **Base Level:** `surface` (#0e0e0f).
- **Secondary Level:** `surface-container-low` (#131314) for large grouping areas like the "Session Canvas."
- **Tertiary Level:** `surface-container-high` (#201f21) for interactive inputs and individual workout nodes.

### The "Glass & Gradient" Rule
To elevate the aesthetic from "flat" to "premium," main CTAs (like "Initialize Protocol") must utilize a subtle gradient from `primary` (#ba9eff) to `primary-dim` (#8455ef). Floating modals or overlays should use **Glassmorphism**: a semi-transparent `surface-variant` color with a `20px` backdrop blur to maintain context with the background data.

## 3. Typography
The typography is a dialogue between "Agression" and "Clarity."

*   **Headlines (Lexend):** Used in bold, italicized weights. This is our signature "Sporty" voice. It conveys momentum and high stakes. `headline-lg` should be used for section titles like "SYSTEM SETUP" to command attention.
*   **Body (Inter):** Used for all functional data. Inter's high x-height ensures readability even at `body-sm` sizes when tracking reps or intervals mid-workout.
*   **Labels:** All labels (`label-md`) should be set in Uppercase with a `0.05em` letter-spacing to enhance the "Technical System" feel.

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** rather than traditional drop shadows.

*   **The Layering Principle:** Avoid elevation shadows where possible. Instead, "nest" containers. An input field (`surface-container-highest`) sitting inside a card (`surface-container-low`) provides enough visual delta to indicate depth without the clutter of shadows.
*   **Ambient Shadows:** When a node must "float" (e.g., a dragging workout node), use a tinted shadow: `0px 12px 32px rgba(139, 92, 246, 0.08)`. This soft purple glow mimics the ambient light of the UI itself.
*   **The "Ghost Border" Fallback:** For nodes on the canvas, use a "Ghost Border"—the `outline-variant` token at 15% opacity. This provides a "technical blueprint" look that fits the node-based canvas style.

## 5. Components

### Primary Action Buttons
- **Style:** High-contrast `primary` background with `on-primary` text.
- **Shape:** `xl` roundedness (1.5rem / 24px) to create a "pill" look that stands out against the angular nodes.
- **State:** On hover, transition to `primary-fixed-dim` with a subtle `2px` inner glow.

### Workout/Rest Nodes
- **Architecture:** `surface-container-high` background with a left-accented border of `primary` (4px).
- **Interaction:** Use `title-sm` for the exercise name and `body-md` for the sub-stats.
- **Forbid Dividers:** Never use lines between data points; use 12px of vertical padding instead.

### Node-Based Canvas
- **Background:** `surface-container-lowest` (#000000).
- **Anchors:** 'Start' and 'End' anchors use `secondary` (#c7f300) for "Start" and `error` (#ff6e84) for "End" to provide instant orientation.
- **Connectors:** Use 2px curved paths in `outline-variant` with 30% opacity.

### Input Fields
- **Background:** `surface-container-highest`.
- **Active State:** The bottom border transforms into a 2px `primary` line. Use `primary` for the icon and label text to indicate focus.
- **Shape:** `md` roundedness (0.75rem).

## 6. Do's and Don'ts

### Do
*   **Do** use italics for every "Action-Oriented" headline to maintain the kinetic energy of the brand.
*   **Do** use `secondary` (#c7f300) sparingly—only for "Success," "Peak Performance," or "Active Timer" states.
*   **Do** layer surfaces (Lowest -> Low -> High) to create natural visual hierarchies.
*   **Do** use icons alongside text in primary buttons to increase tap-target recognition speed.

### Don't
*   **Don't** use 100% white text for body copy; use `on-surface-variant` to reduce eye strain in dark mode.
*   **Don't** use standard "Drop Shadows." They feel dated and muddy in high-performance dark UIs.
*   **Don't** use dividers or horizontal rules. Separate content using the `spacing-xl` scale or background color shifts.
*   **Don't** use non-italicized Lexend for headers. It breaks the "Kinetic" brand promise.