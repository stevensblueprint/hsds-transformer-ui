# Design source and adaptations

Inspected 17 November 2026 through signed-in view/comment-only [Open Referral 26–27](https://www.figma.com/design/6l2vgfgroD1DUmtoV9lZqN/Open-Referral-26-27?node-id=1-2). Login was resolved before the shell implementation. This scaffold follows observed elements; it is not pixel-identical or designer-approved.

| Page/frame             | Node   | Observed design                                                                                |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Design System          | 2:8    | Mint #5BC19F, pale mint #DBFCE5, paper #F9F9F9, cyan/red/amber/near-black; Poppins/Albert Sans |
| Header example “about” | 4:4    | Properties: Poppins 600,48px,100% line height                                                  |
| Desktop - 1            | 4:29   | 1440×1024; paired panes, center assistant placeholder, logo/help                               |
| Desktop - 2            | 49:4   | Grey selected source region                                                                    |
| Desktop - 3            | 49:29  | Underlined file names, speech tail                                                             |
| Desktop - 4            | 49:65  | Scroll thumb/track variant                                                                     |
| Desktop - 5            | 49:101 | Paired-pane/assistant iteration                                                                |
| Desktop - 6            | 51:135 | Pale-mint page background                                                                      |
| Desktop - 7            | 52:2   | Mint header, window mascot, “Did you mean state?”, Done                                        |
| Desktop - 8            | 64:2   | Logo/title/help in mint header                                                                 |
| Desktop - 9            | 64:48  | White-header alternative                                                                       |
| Desktop - 10           | 70:56  | Later mint header, paired paper panes, center guide, bottom Done                               |
| Desktop - 11           | 75:107 | Later layout with scrollbar variant                                                            |

All eleven desktop frames were selected/zoomed individually. [Saved captures](evidence/figma/) retain the observed states. Design System groups include Colors, Typography and Mascot; no formal component variant matrix was established. Visible mascot comments distinguish idle/problem/arrival/success/click poses. The app recreates the simple window mascot from later page frames as SVG; it does not reproduce the separate illustrated mascot artwork/animations.

Present initially opened `chrome-error://chromewebdata/`; the player initially stayed blank but eventually rendered. The player displayed an eleven-frame sequence. Frame navigation and Restart were exercised (including final75:107 and restart49:29). Clicking visible Done, help and the clarification region on75:107 produced no observed frame/dialog transition. This verifies player navigation and the displayed variants, not an end-to-end approval/run contract. See [final player](evidence/figma/prototype-final.png) and [restart state](evidence/figma/prototype-restart.png). Workflow semantics therefore come from the user request, [PRD](https://linear.app/stevensblueprint/document/draft-blueprint-frontend-rework-prd-62aef38338d1) and [D-01–D-08 stories](https://app.notion.com/p/41af7879ec1d81d3bc90c8f90a0ed445); no additional prototype wiring is invented.

## Choices and deviations

- Follow70:56/75:107 mint header, paper panes, center guide and source/output relationship. Bundle Poppins600 headings and Albert Sans400/500/600 text. Type-guide subtitle is Albert Sans Light; scaffold body uses stronger weights for legibility.
- Add dataset/version context, ordered workflow navigation, evidence, counts and explicit approval/run actions required by the PRD. Sparse Figma frames do not specify these controls; placement/content are documented adaptations.
- Replace ambiguous Done with explicit decisions; clarification never means approval. Status words/icons supplement colors. Native scrolling replaces custom triangle scrollbars for keyboard access.
- Dark header/wordmark #143F30 and primary #236D55 retain mint identity while meeting text contrast. White on mint failed2.19:1; intermediate wordmark failed4.30:1 and was darkened again. No axe exclusions hide those failures.
- > 1100px: workspace/center guide/output.721–1100px: guide above two panes.≤720px: labeled stacked sections. Approval scope and error counts remain visible. No mobile or dark frames were found. The light palette intentionally remains under dark system preference; no designed dark theme is claimed.
- Output shows reviewed destination samples and frozen run mappings, not a replacement transformer. Reports/checks are synthetic fixture outcomes. Actual transformed ZIP output comes only from real integration.

Compare `evidence/figma/desktop-10.png` / `desktop-11.png` with desktop Mapping/Review screenshots and Design System with mint/paper/fonts. Mobile evidence demonstrates an adaptation, not mobile Figma fidelity. Pixel-diff, any unobserved prototype wiring, asset-export equivalence and designer approval remain unverified.
