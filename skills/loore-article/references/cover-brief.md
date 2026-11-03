# Cover brief for gpt-image-2 (Loore style)

A cover has two layers. Only the first is generated:

1. **Scene** – gpt-image-2 (in the fleet: the Codex `codex-image` skill on the Codex
   subscription), landscape, quality high, saved as PNG. **No text of any kind.**
2. **Overlay** – the Russian title, eyebrow and the Loore mark (app icon + Geist wordmark),
   composed by `tools/covers` (slice C) with the Geist fonts from slice P. Image models mangle
   Cyrillic and logos, so neither is ever drawn by the model.

Output chain (PLAN §5, owned by slice C): scene PNG → composer → 1600×900 master PNG →
AVIF/WebP/JPEG at 800 and 1600 px + OG JPEG 1200×675 → per-slug manifest in
`brands/loore/assets/covers/<slug>/`. The article author delivers the scene and the overlay
texts; C's tooling does the rest.

## Palette (from `brief/loore-style/tokens.css`)

| Role | Value | Token |
|---|---|---|
| Dark base | `#0E0C0A` | `--color-bg` (dark) |
| Dark surface | `#131110`, `#1E1A15` | `--color-card`, `--color-raised` |
| Warm off-white | `#F3F0EA` / light bg `#F4F1EC` | `--color-text` (dark), `--color-bg` (light) |
| Muted warm grey | `#928C82` | `--color-muted` (dark) |
| The one accent | `#FF7A1A` (fenek orange) | `--color-accent` |
| Gradient (wordmark / CTA only) | `#FF7A1A → #FFB42E → #FFD43B` | `--gradient-wordmark` |

Tokens say: one accent; green only for success; no large gradient fills. So the scene uses
warm near-black and warm off-white with **at most one fenek-orange element**; no other hues
(no blue, cyan, purple, pink, green, no rainbow neon). The gradient stays in the overlay.

Type (overlay only, not in the prompt): Geist / Geist Mono (`--font-sans`, `--font-mono`).

## Style anchor v0 – paste verbatim after the scene line

Status: proposed by slice D, not yet approved visually. Validate on the four E1 pilots, then
freeze; consistency comes from identical wording.

> Editorial product illustration, clean and calm, soft studio light, subtle film grain, wide
> cinematic 16:9 framing with generous empty space on the left third for a title overlay.
> Warm monochrome palette: near-black #0E0C0A and charcoal #1E1A15 shadows, warm off-white
> #F3F0EA highlights, muted warm grey #928C82 midtones. Exactly one accent colour, fenek orange
> #FF7A1A, used on a single key object or light source only. No other colours: no blue, no
> cyan, no purple, no pink, no green, no rainbow neon. No text, no letters, no numbers, no
> words, no logos, no watermarks, no user-interface labels anywhere in the image. Screens and
> phones show abstract shapes only.

## Scene line – one per article

Write one sentence: subject + setting + the single orange element. Rotate subjects across the
12 covers (no two «person looking at a phone»):

- object heroes: a film strip cut into frames on a light table; a stack of index cards with
  one glowing orange card; a phone laid flat with frames fanning out of it as paper prints;
- abstract, no human: a grid of small tiles where one tile glows orange; a waveform turning
  into lines of blank paper; a node network with one orange node;
- environments: an editing desk at night; a quiet studio with a ring light; a wall of pinned
  storyboards.

Add «abstract, no human» to break the figure pattern when the last cover had a person.
Never depict real people, real brand logos or recognisable Instagram/YouTube UI.

## Overlay texts (for `tools/covers`)

- eyebrow: `СТАТЬЯ · <PILLAR>` (for example `СТАТЬЯ · РИЛСЫ`);
- title: the article title or a ≤6-word version of it, no «!»;
- subtitle: optional, ≤60 characters;
- alt text for the article: describes the scene, not the title (`cover_alt` in frontmatter).

Exact composer flags are C's: `<<PLACEHOLDER: tools/covers Loore composer flags (brand, accent markup, logo variant) from slice C>>`.

## Check before handing over

- [ ] zoom the scene to 100 %: no letters, pseudo-letters, numbers or logos (regenerate if any);
- [ ] only one orange element; no stray hues;
- [ ] left third calm enough for the title; important detail survives the 1200×675 OG crop;
- [ ] prompt saved as `brands/loore/assets/covers/<slug>/prompt.md` with model name and date.
