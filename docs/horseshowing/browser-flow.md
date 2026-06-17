# Horseshowing Browser Flow Evidence

Authority: browser-captured requests and live HTML evidence. Do not infer API
contracts from page names; use this only to reproduce session/bootstrap behavior
and identify follow-up network calls.

## Verified Show Selection Flow

Initial selection page:

```text
https://www.horseshowing.com/showsel.php
```

Selected WEC show page:

```text
https://www.horseshowing.com/show.php?show=14905
```

Observed browser request shape:

```js
fetch("https://www.horseshowing.com/show.php?show=14905", {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
  },
  "referrer": "https://www.horseshowing.com/showsel.php",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});
```

## Verified HTML Facts From `show.php?show=14905`

- Page title includes `HorseShowing.com - WEC Ocala Summer Opener`.
- Page title includes `WEC Ocala Summer Opener - June 3 - 7, 2026`.
- Inline JavaScript sets `show_no = 14905;`.
- Buttons present: `Home`, `Select Show`, `Results`, `Schedule`, `Counts`, `Contact Show`, `Enter Online`, `Ring Status`.
- Last updated text observed: `Last Updated: 2026 Jun 06 12:20pm`.
- The page links multiple PDFs under `show_upload/14905/`.

Observed PDF links:

```text
show_upload/14905/598.pdf  Summer Prizelist
show_upload/14905/599.pdf  Jumper Schedule Updated 6.1
show_upload/14905/600.pdf  Hunter Schedule Updated 6.1
show_upload/14905/601.pdf  Equitrace Health Documents
show_upload/14905/630.pdf  Stall Locations
show_upload/14905/640.pdf  Daily Schedule
show_upload/14905/641.pdf  Feed and Bedding Order Form
show_upload/14905/651.pdf  Grand Orders
```

## Discovery Implications

- `show.php?show=14905` is a verified browser bootstrap page for the selected show.
- The page itself is HTML, not the normalized API payload.
- It may be needed to establish browser cookies or show context before calling API-like endpoints.
- PDF links may support team-facing fallback workflows if structured endpoints are too thin.
- `Daily Schedule` and `Grand Orders` PDFs are candidate fallback sources, but only after testing whether they can be parsed reliably.

## Next Evidence To Capture

From the browser Network panel after loading `show.php?show=14905`, capture requests triggered by:

1. `Ring Status`
2. `Schedule`
3. `Results`
4. `Counts`

For each request, capture:

- URL
- method
- request payload
- cookies sent
- response status
- response content type
- raw response preview
- whether response is JSON, HTML, or PDF
