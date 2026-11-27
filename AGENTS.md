# Lost Explorer (working title: Bearing)

Browser game: you're lost in nature and must reach civilization within X days. Two layers: a 2D map (climb to reveal, choose a bearing, fast-forward) and a 3D stop scene (walk, climb, find the next viewpoint).

- Design: `docs/concept.md`
- Tech: `docs/tech-architecture.md`

Read only the sections relevant to the current task. Don't reread whole docs every task. If a doc conflicts with this file, this file wins.

## Priority: ship the MVP

MVP = build order in `docs/tech-architecture.md` §15, steps 1–3: WebGPU spike → 2D map prototype → 3D stop scene. Never work beyond the current step.

- Simplest working solution first. Playable > polished > clean.
- No features, settings, abstractions or refactors that weren't asked for.
- Hardcode values; tune later. Placeholder art (coloured shapes, capsules) is fine.
- Out-of-scope ideas: add one line to `docs/ideas.md`, then move on.

## No tests during the MVP

- Don't write unit, e2e or snapshot tests. Don't set up Vitest or Playwright. Ignore the testing sections in the docs for now.
- Verify with `npm run build` (type-check + build) only, once at the end of a task, not after every edit.

## Token budget

- One task = one goal. Work in small, focused steps.
- Read only the files you need. Don't explore the whole repo; use targeted searches. Don't print large files or full logs (use `head`/`tail`/`grep`).
- No extensive self-review, no rewriting working code for style, no re-reading files you just wrote.
- If the same fix fails twice or a bug is blocking progress, stop investigating rather than repeatedly retrying. Check for an existing GitHub issue; if none exists and you have permission, create one with the symptoms, reproduction steps, expected vs actual behavior, relevant context, and fixes already attempted.
- Use a safe, clearly disclosed workaround if it lets the task continue without hiding the bug; otherwise stop. Report the issue link and workaround or blocker to the user. If you cannot create an issue, provide the same context in your report.
- Don't add a package to save a few lines; prefer the stack below.
- When a choice is genuinely ambiguous, ask one short question. Otherwise pick the simple option and say so in one line.
- Final message: what changed (bullets), how to try it, anything blocked. Max ~10 lines.

## Stack (don't change without asking)

- Next.js 16 (App Router), React 19.2, TypeScript, Tailwind. Pin exact dependency versions.
- `three`, imported from `three/webgpu`, + `@react-three/fiber` v9 with `WebGPURenderer` through the async `gl` callback (tech doc §5). Keep the `forceWebGL` fallback switch.
- Custom shaders in TSL only. Never GLSL (`ShaderMaterial`, `RawShaderMaterial`), never `@react-three/postprocessing`.
- `@react-three/rapier`, `ecctrl`, `@react-three/drei` (renderer-agnostic helpers only), `zustand`, `alea` + `simplex-noise`.

## Code rules

- `game/core/` is pure TypeScript: no `react`, `three` or browser APIs.
- Same seed → same valley: deterministic generation, one seeded RNG per subsystem.
- The game runs client-only (`dynamic(..., { ssr: false })`).
- Frame loop: never `setState`, never allocate objects; use refs and `runStore.getState()`.
- Look: low-poly, vertex colours, Lambert/Toon materials, fog, one directional + one hemisphere light.
