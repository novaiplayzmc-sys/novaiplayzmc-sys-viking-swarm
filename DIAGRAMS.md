# Game Diagrams — Viking Swarm

## The Battlefield

The game now has a **coastal medieval village** background drawn on the canvas:
- Dusk sky with distant snow-capped mountains
- A stone castle on the hill to the right
- Village longhouses with warm glowing windows
- Pine trees along the shoreline
- A viking longship in the water
- Subtle grid overlay for gameplay clarity

All characters are **drawn as proper shapes** — no emojis.

## Wave System

```mermaid
flowchart LR
  A[Wave announced] --> B[Enemies spawn one by one]
  B --> C[I throw axes at them]
  C --> D[Enemies fall]
  D --> E{All dead?}
  E -->|No| C
  E -->|Yes| F{Is there a boss?}
  F -->|No| G[Wave cleared! Short break]
  F -->|Yes| H[Boss appears!]
  H --> I[Boss chases me]
  I --> J[I throw axes at boss]
  J --> K{Boss dead?}
  K -->|No| I
  K -->|Yes| L[Gold explodes everywhere!]
  L --> G
  G --> M[Next wave starts]
  M --> A
```

## Enemies (Drawn Shapes)

| Type | Appearance | Health | Speed | Behavior |
|------|-----------|--------|-------|----------|
| Peasant | Brown tunic, pitchfork | 15 HP | 70 | Chase |
| Footman | Gray armor, sword, shield | 25 HP | 55 | Chase |
| Skirmisher | Green hood, bow | 18 HP | 50 | Zigzag |
| Knight (Boss) | Plate armor, greatsword, gold-rim shield | 40 HP | 50 | Chase |
| Crossbow Captain (Boss) | Leather, crossbow | 55 HP | 45 | Zigzag |
| Templar (Boss) | Heavy plate, greatsword, red cape | 70 HP | 55 | Chase |
| Berserker (Boss) | Bare chest, bear pelt, dual axes | 50 HP | 75 | Chase |
| Warlord (Boss) | Dark plate, crown, flaming sword | 100 HP | 40 | Chase |

## Boss Roster

```mermaid
flowchart TD
  A[Game starts] --> B[Wave 1-2: No boss]
  B --> C[Wave 3: Knight - ONCE only]
  C --> D[Wave 4-5: No boss]
  D --> E[Wave 6: Crossbow Captain]
  E --> F[Wave 7-8: No boss]
  F --> G[Wave 9: Templar]
  G --> H[Wave 10-11: No boss]
  H --> I[Wave 12: Berserker]
  I --> J[Wave 13-14: No boss]
  J --> K[Wave 15: Warlord]
  K --> L[Waves 16+: Bosses cycle<br/>Knight never returns!]
```

## Boss Stats

| Boss | Wave | Health | Damage | Defence | Speed |
|------|------|--------|--------|---------|-------|
| Knight | 3 (ONCE) | 40 HP | 32 (4x) | 20% | 50 |
| Crossbow Captain | 6+ | 55 HP | 26 | 10% | 45 |
| Templar | 9+ | 70 HP | 30 | 25% | 55 |
| Berserker | 12+ | 50 HP | 40 (5x!) | 5% | 75 |
| Warlord | 15+ | 100 HP | 45 | 35% | 40 |

## Main Game Loop

```mermaid
flowchart LR
  A[I move with arrows] --> B[Axes fly by themselves]
  B --> C[Defenders fall]
  C --> D[Grab the gold]
  D --> E[Level up: pick a blessing]
  E --> F[Fight the boss!]
  F --> A
```

## Gold & XP

```mermaid
flowchart LR
  A[Kill an enemy] --> B[Gold coin drops]
  B --> C[I walk over coin]
  C --> D[XP bar fills]
  D --> E{XP full?}
  E -->|Yes| F[Level up!<br/>Odin gives me a blessing]
  E -->|No| A
```
