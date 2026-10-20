# Art direction: a friendly schoolyard at lunchtime

One page, decision record K9. Every picture is original, drawn in the repo as
inline SVG or CSS (`apps/web/src/ui/art/`), with no third-party art, no known
characters or brands, and no image files to download. `npx tsx
e2e/art-sheet.ts out.png` (from `apps/web`) draws every picture on one sheet;
`docs/art-sheet.png` is that sheet.

## Mood
A sunny lunch break: soft green grass, a sandy paved path, open lunchboxes,
trees and benches. Everyone is round, smiling and a little bouncy. Nothing is
scary or sharp. A tummy ache is a green-cheeked wobble, never gross. A hungry
kid is a small tear, not a tantrum.

## Palette
| Use | Colour |
|---|---|
| Ink (every outline, every letter on the art) | warm brown `#4a3428` |
| Page | cream `#fff8ec`; panels white |
| Grass (two shades, a checker) | `#a7d96f`, `#9ccf63`, hedge `#6fae4a` |
| Path paving (two shades) | `#f4dca8`, `#f0d59d`, joints `#e2c07e` |
| Lunchboxes | teal `#33b3a6`, lid `#23877d` |
| Snack colours (RULES 4) | red `#e8483f`, brown `#b9783f`, yellow `#ffd23f`, orange `#ff9a2e`, green `#79c64e` |
| Friends (one each) | Straight blue `#2f6fd6`, Diagonal purple `#8a56d6`, Short amber `#e08a12`, Bouncer teal `#139aa6`, Nurse pink `#e0567a` |
| Shirts (six) | coral, sunflower, leaf, sky, lilac, pink, each with a darker ink for its pattern |
| Highlights | white at 55%; shadows ink at 16% |

## Line and shape
- **Line weight:** one ink outline, 2.5 units in a 48-unit box (about 2 px
  when a picture is 40 px across). Small icons use a 24-unit box with a
  1.6-1.8 unit line, so they hold at 16-20 px. Round caps and joins everywhere.
- **Shapes:** chunky and rounded. Heads are big (about 45% of a figure), eyes
  are dots, cheeks are pink circles, smiles are one curve. Flat fills, one
  white shine, one soft ellipse shadow under anything standing. No gradients
  inside pictures, no filters, no blur: cheap to draw and to animate.
- **Silhouettes first:** every kind of thing is told by its outline before
  its colour. Friends stand on a round base like a game piece; hungry kids
  don't, so the two never look alike.

## The cast
- **Friends** wear a hat that names their chess piece and a white badge that
  draws their throw: Straight a castle-tower helmet and a plus; Diagonal a
  tall tipped hat and a cross; Short a little crown, a short round body and a
  ring of dots; Bouncer a pony hood with ears, a spring under it, and an L
  hop; the Nurse a nurse's cap with a heart and a heart badge (no red cross).
- **Kids** wear one of six shirts. The colour and the pattern go together,
  so a shirt is known without colour: stripes, dots, a star, checks,
  zigzags, a heart. Clues point at a blue sun hat, round glasses and
  sisters (the same shirt, and the same hair). A backpack shows as straps
  and its sides. Four faces: fine, yum, ache, sad.
- **Snacks** each have their own outline and pattern: the apple has a stem,
  a leaf and a shine; the cookie a bite and chips; the banana is a long moon
  with a ridge; the cheese stick a straight stick with holes and a peeled
  strip; the pretzel a salted knot; the grapes a bunch of balls.
- **Scenery:** open teal lunchboxes with their snack sticking out and a tag
  on the front; trees (no fruit, so nothing on the board looks like a
  snack), benches and sandpits; the parents' picnic table with a checked
  cloth.
- **Avatars:** eight animal faces on pastel circles, each with its own outline.

## Clues are read from the art (the hard rule)
Every trait a clue can name has a picture, and colour is never the only cue:

| Clue fact | Picture |
|---|---|
| red, brown, yellow, orange, green | a chip in that colour carrying its own mark: triangle, square, star, diamond, leaf |
| crunchy / soft | a jagged crunch / a cloud |
| sweet / salty | a wrapped sweet / a salt shaker |
| round / long / twisty | a circle / a long bar / a figure-of-eight loop |
| not ... | a slash across the picture |
| same as the kid in the hat / with glasses | the hat / the glasses, with two bars |
| not their sister's | two kids in matching shirts, with a slash |

The colour mark appears on the lunchbox's tag, beside each snack in the
clue card and in the clue's own pictures, so a colour-blind player matches
the triangle on "not red" to the triangle on the apple's box. A test
(`art.test.ts`) fails if two snacks, two shirts or two friends would differ
only in colour.

## Motion
Pictures move on `transform` and `opacity` only, by CSS and the Web
Animations API, driven by the wave result (P7). Snacks fly the real route:
a low skim for Straight and Diagonal lines, a little hop for a Short and a
high arc for a Bouncer's jump. A friend bobs as it catches; a lunchbox lid
pops; a fed kid dances; a tummy ache wobbles; the Nurse sends sparkles; a
hungry kid walks home sad; in Kindy a wrong snack bounces off a shaking
head. With reduced motion the snacks glide without arcs or spins, and
reactions are a face change and a gentle fade.

## Kindy
The same art, bigger: squares of about 80 px, each kid with the snack they
want in a white bubble over their head, and pictures only, with no letters
or digits anywhere (RULES 11).
