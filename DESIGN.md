# FreeCoffee - Promova style reference

Source: https://styles.refero.design/style/dae5e893-ca18-44c3-8f83-358cb52af237

## Direction

Midnight magazine with one yellow highlighter. The page is a near-black editorial canvas with white type. Electric yellow is functional punctuation for the primary action, not general decoration. Components are flat paper inserts, not glossy dashboard widgets.

## Tokens

- Canvas: `#000000`
- Primary text and inverted surfaces: `#ffffff`
- Secondary text: `#a7a7a7`
- Hairlines: `#dddddd`
- Light card: `#f5f5f5`
- Primary action: `#fff050`
- Optional cool paper inserts: `#dfe3ff` and `#bec8ff`, used rarely
- Display: Nekst when licensed and hosted; fallback `Bricolage Grotesque`, `Space Grotesk`, `General Sans`, sans-serif
- UI/body: Manrope; fallback Inter, `Plus Jakarta Sans`, `DM Sans`, sans-serif
- Display headings: 40px or larger, weight 400, line-height 1
- Body and UI: 14-20px, weight 500. Secondary copy uses weight 200. Emphasis uses 700.
- Content max-width: 1200px
- Section gap: 80px
- Card padding: 30px
- Button radius: 20px; small control radius: 10px; card radius: 30px

## Rules

- Keep the canvas black across sections. Use white or Smoke cards for separation.
- Use yellow only for the single primary action or a small functional highlight.
- Do not use pill buttons, thick borders, gradients, or box shadows.
- Keep cards flat with a 1px hairline at most.
- Use oversized editorial headings and generous black space.
- Keep icons small and functional.
- Product truth and accessibility beat visual mimicry. Error and success states may use text labels or standard semantic colors when needed for comprehension.

## Notifications and alerts

- Sponsorship never interrupts the user.
- Queue payout-failure and consent-change alerts until a task boundary: app or window switch, task completion, idle, or explicit popover open.
- Interrupt immediately only when waiting would cause harm.
- Show queued alerts in the next user-opened FreeCoffee surface; keep the status-area sponsor placement passive.
- Research basis: Adamczyk and Bailey, CHI 2004, https://www.interruptions.net/literature/Adamczyk-CHI04-p271-adamczyk.pdf
