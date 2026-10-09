# ValuStage

ValuStage is a corporate valuation analytics tool for artist-driven entertainment companies, with SM Entertainment (KOSDAQ: 041510) as the first case. It was built for SYSEN 5900 at Cornell University (Fall 2026).

- `index.html` is the project page: the problem, user needs, concept sketch, context diagram, scope, originating requirements and references.
- `tool.html` is the interactive valuation tool. It covers Bear, Base and Bull DCF scenarios, peer multiples, the revenue growth implied by the share price, a sensitivity chart and an artist-level revenue model.
- `downloads/ValuStage_MVP_Prototype.xlsx` is the Excel prototype. Its logic is the same as the web tool.

The site is plain HTML, CSS and JavaScript, with no build step. The valuation logic is in `assets/model.js`.

All values are estimates for coursework and are not investment advice. Artist-level figures, peer multiples, D&A and net cash are illustrative placeholders.
