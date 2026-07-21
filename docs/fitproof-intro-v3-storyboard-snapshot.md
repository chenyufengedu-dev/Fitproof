# FitProof Intro V3 Snapshot — Four-Step Storyboard

This snapshot preserves the previous storyboard implementation before the brand
intro was simplified into a single lockup event.

## Purpose

The previous version followed the four-step reference:

1. Logo reveal.
2. Cat checks the `Fit` area.
3. Cat moves to the `Pro` area.
4. Cat checks `of` and rests on the right.

## Key implementation details

- `frontend/components/FitProofIntro/FitProofIntro.tsx` used `CAT_STORY_FRAMES`.
- The homepage loaded:
  - `frontend/public/brand/fitproof-story-cat-peek.png`
  - `frontend/public/brand/fitproof-story-cat-fit.png`
  - `frontend/public/brand/fitproof-story-cat-pro.png`
  - `frontend/public/brand/fitproof-story-cat-final.png`
- `frontend/app/globals.css` used `fitproofCatStoryboard`,
  `fitproofFramePeek`, `fitproofFrameFit`, `fitproofFramePro`, and
  `fitproofFrameFinal`.

## Why this snapshot was superseded

The user identified that the cat and wordmark felt like separate animation
events. The next version simplifies the concept to a single brand lockup event:
the FitProof wordmark reveals while the cat companion appears with the final
letters and settles in the lower-right assistant position.
