# Web reading and body extraction

Updated 2026-10-31. Investigation found PMC HTTP 403 responses, Wiley/Lancet challenge pages and MDPI without article bodies. The old reader mislabeled Forbidden pages as short content and proxied Node-fetched responses into Chromium, missing native TLS/cookie/navigation behavior. Fixed waits could precede dynamic content. The replacement keeps strict body thresholds and adds proper transport, phased budgets, readiness and explicit scope/diagnostics.

## Reading policy

1. PMC/PubMed use official NCBI BioC services. PMC requires open full text; PubMed is bibliographic/abstract scope and explicitly not full text. Do not fall back to scraping PMC pages contrary to site guidance.
2. Require one matching document, title and content; PMC also needs body passages. Accept PMC-prefixed/numeric IDs while cross-checking article-id_pmc. Reject help/errors, wrong IDs and abstract-only PMC responses.
3. Ordinary auto mode tries HTTP with an anonymous per-read cookie jar, verifying/pinning public IPs at each redirect. A loop requires unchanged URL/cookies. A separate static timeout preserves fallback budget.
4. Fallback uses isolated native Chromium TLS/cookies/redirects/JS through a temporary local CONNECT gateway. Every actual connection validates all DNS results and pins a public IP; responses are not fetched/rewritten by Node. Disable implicit loopback bypass and QUIC. Private redirects/subresources are blocked.
5. Fresh browser contexts retain only anonymous site cookies. Block service workers, WebSockets, popups, downloads and image/font/media resources. Allow GET/HEAD and bounded 64KiB data POST with ordinary OPTIONS preflight, not form-navigation POST or other methods. Never use personal profiles/logins/credentials.
6. After DOM load, wait initial delay, then observe usable stable body within a bounded readiness/total budget. Navigation snapshot races receive bounded retries; continuous navigation fails explicitly. Do not wait indefinitely for analytics.
7. Bound tunnel traffic in both directions and decoded CDP resource/total bytes, concurrent reads, requests, navigation and final DOM. Parent cancellation covers queue/network/browser and cleans late-created browsers/tunnels.
8. JSDOM with scripts/resources disabled, Readability and Turndown/GFM preserve body, headings, tables and absolute links. Nonarticle fallback uses main/article/body. HTTP/Forbidden/cookie/challenge/login/paywall/short-body failures remain distinct diagnostics, not evidence.

Missing API records do not prove a paper nonexistent or a personal browser unable to open it. BioC text may omit table layout, images and supplements; source Markdown retains scope/license limitations.

## Dependencies and references

Reuse Playwright, Readability 0.6.0 (Apache-2.0), JSDOM 27.4.0 (MIT), Turndown 7.2.4/GFM 1.0.2 (MIT) and tough-cookie 6.0.2 (BSD). No browser/Pi internals were copied or Pi upgraded. Crawlee duplicates existing queue/cache/budget persistence; Crawl4AI adds another Python service. Neither guarantees challenge bypass or nonopen full text.

References: [NCBI developer/BioC guidance](https://pmc.ncbi.nlm.nih.gov/tools/developers/), [Playwright networking](https://playwright.dev/docs/network), [Readability](https://github.com/mozilla/readability), [Turndown](https://github.com/mixmark-io/turndown), [Crawlee](https://github.com/apify/crawlee), [Crawl4AI](https://github.com/unclecode/crawl4ai).

## Archives and settings

research/web-UUID.raw.txt retains original responses (XML for BioC), .rendered.txt browser DOM/API-derived HTML and .md readable material. Store requested/actual URLs, chain, method, scope, limitations, diagnostics and attempts. UI distinguishes official API/native Chromium/HTTP and abstract/full text. Policy changes permit bounded retry of historical failures without clearing history; valid digest-matching success is reusable.

| Setting | Default | Meaning |
| --- | --- | --- |
| DREAMATIC_WEB_READER | auto | auto/http/browser for ordinary pages; official scholarly APIs |
| DREAMATIC_WEB_READER_TIMEOUT_MS | 90000 | Whole read including queue |
| DREAMATIC_WEB_HTTP_TIMEOUT_MS | 15000 | Static phase |
| DREAMATIC_WEB_SCHOLARLY_TIMEOUT_MS | 15000 | Official API phase |
| DREAMATIC_WEB_MAX_REDIRECTS | 12 | HTTP redirects/main navigations |
| DREAMATIC_WEB_BROWSER_WAIT_MS | 2000 | Initial post-DOM delay |
| DREAMATIC_WEB_BROWSER_READY_TIMEOUT_MS | 15000 | Additional readiness bound |
| DREAMATIC_WEB_BROWSER_MAX_REQUESTS | 60 | Per-page requests |
| DREAMATIC_WEB_BROWSER_MAX_BYTES | 20000000 | Transferred and decoded cumulative bounds |
| DREAMATIC_WEB_BROWSER_CONCURRENCY | 2 | Process-local parallel reads |

Search advanced settings persist to .env. MAX_FETCH_BYTES still bounds responses/final DOM, NETWORK_TIMEOUT_MS underlying connections, and CHROME_PATH is shared with PDF. The historical configuration count was 73; use current CONFIG_FIELDS for present values.

## Verification and limitations

The historical 76-test checkpoint passed check/build, including 19 reading/research cases: identity/full-text/abstract checks, raw XML, cookies/loops/Markdown, dynamic readiness, limits/cancellation and actual Chromium CONNECT HTTPS with redirects/data POST/public-IP pinning/private blocking. Test certificates were trusted only by test SPKI; production TLS verification remained enabled.

Historical public reads used temporary configuration without personal browser data, paid models or user-project writes:

| Source | Result |
| --- | --- |
| PMC12128495 | Official full text, about 63,762 characters |
| PMC6414024 | Official full text, about 47,994 characters |
| PMC10061888 | Official full text, about 31,201 characters; numeric ID confirmed |
| PMC11057359 | No matching API record; help pages rejected |
| PubMed 41412135 | About 2,140 abstract characters, not full text |
| IDF China | HTTP/Readability, about 4,261 characters |
| MDPI specified page | Native Chromium still HTTP 403 |
| Wiley/Lancet specified pages | Still security verification/403 despite bounded navigation retries |

These observations do not establish current universal availability or validate article statistics. Personal-browser access does not imply independent automation access. Use other open sources or upload originals for remaining failures. Remote binary PDF/Office still requires download/upload; resource listings are not full reports.

Cloudflare documents unsupported automated production challenge solving. Some challenge-subdomain DNS failures may be nonfatal detection behavior. The observed brunhild ENOTFOUND was diagnostic, not a proven root cause. See [supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) and [challenge issues](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/).
