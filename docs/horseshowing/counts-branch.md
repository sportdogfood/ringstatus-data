# Counts Branch Evidence

Authority: browser-captured request and payload evidence. This file starts as a
capture target. Do not infer endpoint contracts from button names.

## Branch

```text
show.php?show=14905 -> counts
```

## Verified Request

```js
fetch("https://www.horseshowing.com/counts.php", {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
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
  "referrer": "https://www.horseshowing.com/schedule.php",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});
```

Verified response type: full HTML document.

## Verified Page Facts

- Page title includes `HorseShowing.com - WEC Ocala Summer Opener`.
- Inline JavaScript sets `session_show_no = 14905;`.
- Inline JavaScript sets `show_times = 1;`.
- Last updated text observed: `Last Updated: 2026 Jun 06 12:20pm`.
- Table header labels are `Number`, `Description`, and `Entries`.
- Captured HTML contains 292 `.link` class/count rows.
- Empty target container observed: `#class_orders`.

## Verified Row Shape

Rows are rendered as table rows with:

- `.num_cell`
- `.name_cell`
- `.entries_cell`

The class link inside `.name_cell` carries:

- `data-class`
- `data-num`
- `data-name`
- visible class name text

Example:

```html
<span class="link"
      data-class="33433"
      data-num="18"
      data-name="$250 Green Hunter 3'3&quot;/3'6&quot;">
  $250 Green Hunter 3'3"/3'6"
</span>
```

## Capture Checklist

For each request fired by the Counts branch, capture:

- URL
- method
- referrer
- request headers that affect behavior
- request body
- cookies/session requirement
- response status
- response content type
- raw response preview
- parsed shape, if JSON
- useful fields for SGL target mapping

## Expected Usefulness To Evaluate

Counts supports, from this capture:

- class entry counts
- class inventory
- class number to Horseshowing class id mapping

Counts does not provide in this captured document:

- ring/day placement
- class time
- live trip state
- rider/horse detail
- results

Potential follow-up: clicking a class may hydrate `#class_orders`; capture any
request or DOM fragment produced by that interaction before assuming order detail
is available from Counts.

## Capability Mapping

- `classes`: available
- `entries`: partial as class entry counts
- `class_times`: missing
- `rings`: missing
- `days`: missing
- `go_times`: missing
- `trips`: missing
- `live_trips`: missing
- `riders`: missing
- `results`: missing

Classification: HTML scrape/parser source for class inventory and entry counts.
