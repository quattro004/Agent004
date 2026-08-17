# Max Height — Character Image Prompts

> **Purpose**: AI image generation prompts for Max Height's 7 key animation frames.
> Generate all 5 frames per style. Pick one style direction, then we'll implement.
>
> **IP constraint (P4)**: NOT Matt Frewer, NOT any real celebrity — an entirely original face.

---

## How to Use These Prompts

1. **Pick a style** (A, B, or C) — or generate a few from each to compare.
2. For each frame, combine the **Base description** + the **Frame addition** into one prompt.
3. Generate at **3:2 aspect ratio** (e.g., 1024×682 or 768×512).
4. **Background must be solid black** — integrates cleanly behind the CRT frame.
5. Use image-to-image / "vary" features to keep the character consistent across frames.
6. Save as PNG files.

### File naming

Place generated images in `packages/frontend/public/avatar/`:

```
avatar/
├── idle.png        ← Frame 1
├── talk-1.png      ← Frame 2
├── talk-2.png      ← Frame 3
├── glitch.png      ← Frame 4
├── blink.png       ← Frame 5
├── laugh.png       ← Frame 6
└── side-eye.png    ← Frame 7
```

---

## Style A: Retro-Digital CG (80s Computer Graphics Aesthetic)

A character that looks like it was rendered on 1980s computer hardware — low-poly feel, neon palette, glowing edges. Think Tron meets Max Headroom's artificial flatness.

### Base Description (include in every prompt)

> A stylized male digital TV presenter head and shoulders, 1980s computer-generated aesthetic. Angular jaw, slicked-back platinum blonde hair with neon blue highlights, sharp cheekbones. Wearing a dark suit jacket with electric blue pinstripes and thin neon lapel trim. Background is solid black. Flat studio lighting with strong rim light in cyan. The face has an uncanny digital quality — slightly too smooth, slightly too angular, like early 3D rendering. NOT photorealistic, NOT any real person. Aspect ratio 3:2, centered composition.

### Frame Prompts

**Frame 1 — Idle (neutral)**
> [Base description] + Mouth closed in a slight smirk. Direct eye contact. Confident, composed expression. Slight head tilt to the right.

**Frame 2 — Talk-1 (mouth open)**
> [Base description] + Mouth open mid-speech, teeth visible. Eyebrows raised as if making a grand proclamation. Animated, enthusiastic expression.

**Frame 3 — Talk-2 (different mouth shape)**
> [Base description] + Mouth in an "O" shape as if saying "ooh". Eyes slightly wider. One eyebrow cocked skeptically.

**Frame 4 — Glitch**
> [Base description] + The face is visually corrupted — horizontal displacement of the left half, chromatic RGB split, scan line tears across the face. Expression frozen mid-word. Digital artifacting.

**Frame 5 — Blink / Eyes Closed**
> [Base description] + Eyes closed, slight downward head tilt. Peaceful/smug expression. Mouth in a knowing half-smile.

**Frame 6 — Laugh**
> [Base description] + Head tilted back, mouth wide open in a genuine laugh. Eyes crinkled with amusement. Radiating self-satisfaction — laughing at his own joke. Teeth fully visible. Exuberant, theatrical energy.

**Frame 7 — Side-Eye**
> [Base description] + Eyes shifted hard to the right, head still facing forward. Suspicious, conspiratorial sideways glance. One eyebrow raised. Slight pursed-lip smirk. The look of someone who just heard something scandalous and is deciding whether to share it.

---

## Style B:Pop-Art / Illustrated (Bold, Graphic, Warhol-esque)

High-contrast, bold outlines, limited color palette. Closer to a stylized comic book or pop-art poster. Very eye-catching on the CRT screen.

### Base Description (include in every prompt)

> A bold pop-art illustration of a male TV presenter head and shoulders. Strong black outlines, limited color palette of cyan, magenta, electric yellow, and black. Flat areas of color with halftone dot patterns. Sharp angular features, exaggerated jawline, styled pompadour hair in platinum with magenta highlights. Wearing a power suit with oversized shoulders. Background is solid black. Style of Patrick Nagel meets Roy Lichtenstein. NOT any real person. Aspect ratio 3:2, centered composition.

### Frame Prompts

**Frame 1 — Idle (neutral)**
> [Base description] + Confident closed-mouth smirk. Direct gaze. One eyebrow slightly raised.

**Frame 2 — Talk-1 (mouth open)**
> [Base description] + Mouth wide open in a dramatic declaration. Text-bubble energy without actual text bubble. Eyebrows high.

**Frame 3 — Talk-2 (different mouth shape)**
> [Base description] + Mouth in sardonic grin, teeth showing. Head tilted, conspiratorial look. Winking.

**Frame 4 — Glitch**
> [Base description] + The illustration splits into CMYK misregistration — each color layer offset. Face fragments into halftone dots. Static interference lines.

**Frame 5 — Blink / Eyes Closed**
> [Base description] + Eyes represented as curved lines (classic comic closed-eyes). Serene, self-satisfied smile.

**Frame 6 — Laugh**
> [Base description] + Head thrown back, mouth wide open showing teeth in a big laugh. Eyes squeezed into happy crescents. Bold motion lines radiating from the head. Pure theatrical delight — the look of a man who thinks he's the funniest person on television.

**Frame 7 — Side-Eye**
> [Base description] + Eyes shifted dramatically to the right while head stays forward. Suspicious, knowing sideways glance. One eyebrow arched high. Tight-lipped conspiratorial smirk. Speed lines near the eyes to emphasize the sudden look.

---

## Style C: Retro CG Cartoon (Cel-Shaded with Sunglasses)

A clean, modern cartoon take on the iconic 80s digital TV presenter — cel-shaded animation with bold outlines and exaggerated features. Confident, cool, and a little ridiculous. Think *Archer* meets 80s computer graphics, with signature sunglasses adding extra swagger. 

### Base Description (include in every prompt)

> A stylized cartoon portrait of a male digital TV presenter, head and shoulders, cel-shaded animation style. Exaggerated angular jaw, sharp prominent cheekbones, slicked-back platinum blonde hair with a high sheen. Wearing reflective dark sunglasses with a faint cyan lens tint. Dark navy suit jacket with electric blue neon pinstripes and sharp padded shoulders. Clean black outlines, flat color fills with bold cel-shaded lighting. Dramatic blue-cyan rim light from the right, warm key light from the left. Think Max Headroom. Background is solid black. Cocky, larger-than-life energy. Features are cartoonishly exaggerated — the jaw is too sharp, the hair is too perfect, the shoulders are too wide. NOT photorealistic, NOT any real person. Aspect ratio 3:2, centered composition.

### Frame Prompts

**Frame 1 — Idle (neutral)**
> [Base description] + Slight smirk, mouth closed. Head tilted slightly to the right. Exuding effortless cool behind the sunglasses. One eyebrow visible above the sunglasses frame, slightly raised.

**Frame 2 — Talk-1 (mouth open)**
> [Base description] + Mouth open mid-speech, teeth visible in a wide grin. Eyebrows high above the sunglasses. Animated, theatrical expression — delivering a monologue to the world. Slight forward lean.

**Frame 3 — Talk-2 (different mouth shape)**
> [Base description] + Mouth in a rounded "ooh" shape. Head tilted slightly left. Sunglasses glinting with a cyan highlight. One eyebrow cocked skeptically above the frames — amused and mischievous.

**Frame 4 — Glitch**
> [Base description] + The cartoon is visually corrupted — horizontal displacement of the left half, RGB color channel split, bold scan line tears across the face. The sunglasses are fragmented. Expression frozen mid-word. Digital artifacting rendered in the same cel-shaded style.

**Frame 5 — Blink / Eyes Closed**
> [Base description] + Sunglasses pushed up onto forehead, eyes closed. Slight downward head tilt. Smug, self-satisfied half-smile. Peaceful but radiating superiority — even resting, he knows he's the coolest person on television.

**Frame 6 — Laugh**
> [Base description] + Head tilted back, mouth wide open in a big cartoon laugh. Sunglasses slightly askew from the force of the laugh. Eyes crinkled above the frames. Platinum hair catching the blue rim light. Pure theatrical self-delight — laughing at his own joke. Bold, exuberant energy.

**Frame 7 — Side-Eye**
> [Base description] + Head facing forward, sunglasses lowered to the tip of the nose, peering over the top of the frames with eyes shifted hard to the right. Suspicious, conspiratorial sideways glance. One eyebrow arched high. Tight-lipped knowing smirk. The classic "I know something you don't" look.

---

## Tips for Consistent Results

- **Seed locking**: If your tool supports seeds, generate Frame 1 (idle) first, then use the same seed + image-to-image for the other frames.
- **Batch variations**: Generate 3-4 variants of each frame, then pick the most consistent set.
- **The glitch frame is the most forgiving** — inconsistency actually helps the glitch aesthetic.
- **Test against the TV frame**: Drop a generated image into `packages/frontend/public/avatar/idle.png` and view it in the app to check fit before generating the full set.
