# FitProof Intro V2 Snapshot — PNG Cat Pose Sequence

This snapshot preserves the previous homepage brand intro direction before V3.

## Purpose

V2 used the four transparent cat images supplied by the user and cross-faded them
while the whole cat wrapper moved into the FitProof lockup.

## Key files at snapshot time

- `frontend/components/FitProofTitleAnimation.tsx`
- `frontend/app/globals.css`
- `frontend/components/__tests__/fitproof-brand-intro.test.mjs`

## V2 cat assets

- `frontend/public/brand/fitproof-cat-reference-peek.png`
- `frontend/public/brand/fitproof-cat-reference-walk.png`
- `frontend/public/brand/fitproof-cat-reference-stand.png`
- `frontend/public/brand/fitproof-cat-reference-final.png`

## V2 animation model

- `CAT_FRAMES` preloads the four PNGs.
- `.fitproof-intro__cat-wrapper` runs `fitproofCatTravel`.
- `.fitproof-intro__cat-frame--peek`, `--walk`, `--stand`, and `--final` run
  overlapped opacity/position keyframes.
- Total duration: `2400ms`.

## Why V3 replaced it

The V3 requirement explicitly forbids multi-PNG pose switching and asks for a
single SVG cat character whose `body`, `head`, `arm`, `magnifier`, `eye`, and
`tail` can animate independently. Keep this V2 snapshot only as a recovery point
and visual reference for the no-background cat style.
