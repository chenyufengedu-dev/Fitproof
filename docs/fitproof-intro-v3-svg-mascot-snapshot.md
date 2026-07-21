# FitProof Intro V3 Snapshot — Single SVG Mascot

This snapshot preserves the previous V3 implementation before switching the
homepage intro to the user-supplied four-image storyboard style.

## Purpose

The previous V3 followed the written requirement of using one SVG mascot with
separate animated parts:

- `cat-body`
- `cat-head`
- `cat-arm`
- `magnifier`
- `eye`
- `tail`

## Key files at snapshot time

- `frontend/components/FitProofIntro/FitProofIntro.tsx`
- `frontend/components/FitProofIntro/CatMascot.tsx`
- `frontend/app/globals.css`
- `frontend/components/__tests__/fitproof-brand-intro.test.mjs`

## Why this snapshot was superseded

The user supplied a more specific storyboard reference and four no-background
cat images. The visual requirement shifted from the hand-drawn SVG mascot style
to the provided cat art style. This snapshot is a recovery point for the SVG-only
implementation.
