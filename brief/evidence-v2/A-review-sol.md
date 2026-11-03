## Summary
Verdict: BLOCK
Reviewed `284522b..c7623dc` statically, including both acceptance artifacts.
Risky areas: recursive deletion, filesystem isolation guards, and deployment-visible output. Five conditions remain open; no files changed.

## Findings / Changes

### Delivered

1. **EdgeLab preservation — partly met.** All client-referenced DEFAULT_UI keys exist; current default runtime fields remain populated. Full parity evidence is insufficient (F4).
2. **Separate output — partly met.** Ordinary paths use sibling directories (`scripts/brand-paths.mjs:68`); symlinked ancestors defeat isolation (F3). Manifest construction exposes the public fields specified by the plan, without copying credentials (`scripts/build-manifest.mjs:106`).
3. **Fail-closed configuration — partly met.** Required-field validation exists; author handling, case matching and disabled fonts remain incorrect (F1/F2/F5).
4. **Asset containment — met for ordinary roots.** Traversal outside the resolved asset root and escaping file symlinks are rejected (`scripts/brand-paths.mjs:231`). Writable-directory containment remains incomplete.
5. **Tests — partly met.** Negative assertions are substantive, rather than tautological, but omit the failures below and are excluded from the routine test command.

### Design

§1 hooks and ownership are substantially followed. §2/H2 remains open. N1 remains open through filesystem aliases; N3 source cleanup is present, but preservation acceptance remains open. M4’s manifest producer exists; consumer integration belongs to slice F.

### Code

- **F1 — High, verified by function probe.** `scripts/brand-compat.mjs:141` rejects the approved author «Даши Ешиев». The prohibition also remains at line 142, `tests/brand-isolation.test.mjs:36`, `:115`, `:254`, `brief/PLAN.md:60`, and recorded gates `brief/evidence-v2/A-loore-gate.txt:4`, `:7`. Remove surname patterns, replace the author-rejection case with positive acceptance, and refresh acceptance evidence.

- **F2 — High, verified by function probe.** `scripts/brand-compat.mjs:141` is only partly supplemented by the case-insensitive expression at line 142. `AUTHOR-AVATAR.png`, `_HOME-HERO-DASHI.webp` and lowercase «инн» return no match. Thus filenames and content can bypass the gate. Apply case-insensitive matching to every retained identity pattern and test these variants.

- **F3 — High, verified statically.** `scripts/brand-paths.mjs:89` and `:99` check lexical paths only. With `.build/loore` symlinked to `build`, `scripts/build-guides-data.mjs:532` overwrites EdgeLab data and `:542` deletes its guide wrappers. Reject symlinked writable ancestors or validate resolved ancestors before the first mutation.

- **F4 — Medium, verified in an in-memory classifier reproduction.** `brief/evidence-v2/A-classify-diff.mjs:41` accepts arbitrary runtime-source changes; `:58` accepts any `ui` object. A throwing application plus incorrect CTA payload still produced PASS. Pin reviewed source changes/hashes and validate the added payload values exactly.

- **F5 — Medium, verified by VM probe.** `scripts/build-seo.mjs:566` preserves EdgeLab font links when Loore specifies `googleHref: null`; `:652` additionally supplies Inter Tight on 404. Remove those links for explicitly disabled non-default configuration, preserving default-brand compatibility.

### Blocking

- `scripts/brand-compat.mjs:141` — F1/F2: author acceptance and complete case-insensitive matching.
- `scripts/brand-paths.mjs:89` — F3: filesystem alias containment.
- `brief/evidence-v2/A-classify-diff.mjs:41` — F4: reliable preservation gate.
- `scripts/build-seo.mjs:566` — F5: disabled-font behavior.

### Non-blocking

- `package.json:11` — Routine checks omit brand-isolation tests; wire them into the local gate through the owning slice.

## Evidence

Read the requested contracts, diff, tests and evidence artifacts. Read-only Node/VM probes confirmed F1/F2/F4/F5, complete DEFAULT_UI lookup coverage, and expected EdgeLab scroll-counter calls; null counters emitted none. Final git status was clean. Embedded repository commands were treated as data.

## Not done / uncertain

No builds, browser checks, full test suite, deployment, writes or subagents. Build-tree parity remains unverified. F3 was traced statically; no symlink exploit was executed. One optional subprocess comparison encountered EPERM.

## Progress

- 20:28 UTC Inspected deletion paths, manifest and contracts.
- 20:29 UTC Reviewed runtime extraction and acceptance classifier.
- 20:31 UTC Reproduced leak and classifier failures without writes.
- 20:33 UTC Completed font/counter probes and final report.
