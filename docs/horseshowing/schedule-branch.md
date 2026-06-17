# Schedule Branch Evidence

Authority: browser-captured request and payload evidence. Do not infer additional
params or downstream contracts until more requests are captured.

## Verified Request

Branch:

```text
show.php?show=14905 -> schedule.php -> get_ring_days.php
```

Observed request:

```js
fetch("https://www.horseshowing.com/get_ring_days.php", {
  "headers": {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "XMLHttpRequest"
  },
  "referrer": "https://www.horseshowing.com/schedule.php",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});
```

## Verified Payload Shape

Top-level response is an array of ring objects:

```json
{
  "ring_no": "665",
  "name": "Indoor 4 - Gary",
  "ring_days": [
    {
      "ring_day_no": "3830",
      "date": "Tuesday, June 2, 2026"
    }
  ]
}
```

Fields observed:

- `ring_no`
- `name`
- `ring_days[]`
- `ring_days[].ring_day_no`
- `ring_days[].date`

## Observed Rings For Show 14905

```text
664 Grand Arena - Brandon
665 Indoor 4 - Gary
666 Indoor 1 - Sarah H
667 Indoor 2 - Jo
748 Jumper Annex - Robbie
749 Hunter 2 - Matt
```

## Capability Mapping

- `rings`: available from `get_ring_days.php`
- `days`: available by ring from `ring_days[]`
- `show_dates`: partial/derived from distinct `ring_days[].date`
- `classes`: not provided by this payload
- `class_times`: not provided by this payload
- `entries`: not provided by this payload
- `trips`: not provided by this payload

## Follow-up Capture Needed

Use each `ring_day_no` to identify the next request that hydrates classes or
schedule detail. Capture the Network request fired when a ring/day is selected
in the schedule UI.

Status update: Schedule branch capture is complete enough for first-pass
planning. Continue observing browser refresh behavior for:

```text
https://www.horseshowing.com/get_orders.php
https://www.horseshowing.com/get_ring_day_oc.php
```

`get_orders.php` is already documented as the current/live-ish status payload.
`get_ring_day_oc.php` remains the next endpoint to verify if it appears during
refresh or ring-day interaction.

## Verified Current Orders Request

Observed request:

```js
fetch("https://www.horseshowing.com/get_orders.php", {
  "headers": {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "XMLHttpRequest"
  },
  "referrer": "https://www.horseshowing.com/schedule.php",
  "body": "show_no=14905",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});
```

Verified payload shape:

```json
{
  "show_no": "14905",
  "ring_no": "665",
  "ring_day_no": "3834",
  "ring": "Indoor 4 - Gary",
  "day": "Saturday, June 6, 2026",
  "class": "756) $500 1.10m Amateur Jumper II.2d",
  "entry": "#2370, Diamo De L'anglissant Z<br>In ring at 2:36pm",
  "total": "29",
  "n_to_go": "26",
  "n_gone": "3",
  "time": "2:36pm",
  "timestamp": 1780770978,
  "elapsed": 29,
  "orders": [],
  "gone": []
}
```

Fields observed:

- `show_no`
- `ring_no`
- `ring_day_no`
- `ring`
- `day`
- `class`
- `entry`
- `total`
- `n_to_go`
- `n_gone`
- `time`
- `timestamp`
- `elapsed`
- `orders`
- `gone`

Capability mapping from this payload:

- `rings`: available by current rows
- `days`: available by current rows
- `classes`: partial/current active classes
- `entries`: partial/current entry text
- `go_times`: partial/current in-ring time
- `live_trips`: partial/current status
- `trips`: not full history in the observed sample
- `riders`: not observed
- `results`: not observed

Important limitation: observed rows represent current/live-ish ring state, not a
complete class schedule.

## Verified Ring-Day Schedule Fragment Request

Observed request:

```js
fetch("https://www.horseshowing.com/update_schedule.php", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Microsoft Edge\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "XMLHttpRequest"
  },
  "referrer": "https://www.horseshowing.com/schedule.php",
  "body": "show_no=14905&ring_day_no=3828",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});
```

Verified response type: HTML fragment.

The fragment contains an accordion with `h3.ring_evt` schedule event headers.
Observed attributes:

- `id`
- `data-show`
- `data-class`
- `data-time`
- `data-n_entries`
- `data-name`
- `data-re_type`
- `data-oc_id`
- `data-live`
- CSS class containing the ring-day marker, for example `rd3828`

Observed child display fields:

- `.ring_evt_time`
- `.ring_evt_entries`
- `.ring_evt_name`

Example class event:

```html
<h3 id="55695"
    data-show="14905"
    data-class="28341"
    data-time="8:45 am"
    data-n_entries="17"
    data-name="691) 1.20m Young Jumpers  II.2b"
    data-re_type="1"
    data-oc_id="0"
    data-live="0"
  class="accordion-header ui-accordion-header ui-helper-reset ui-state-default ui-accordion-icons ui-corner-all rd3828 ring_evt">
</h3>
```

Example non-class ring event:

```html
<h3 id="62580"
    data-show="14905"
    data-class="0"
    data-time=""
    data-n_entries="0"
    data-name="Course Walk 7:30 am-7:45 am"
    data-re_type="5"
    data-oc_id="0"
    data-live="0"
  class="accordion-header ui-accordion-header ui-helper-reset ui-state-default ui-accordion-icons ui-corner-all rd3828 ring_evt">
</h3>
```

Capability mapping from this payload:

- `classes`: available for selected `ring_day_no` when `data-class` is nonzero
- `class_times`: available as `data-time` for class events
- `entries`: partial as `data-n_entries`
- `rings`: inherited from selected `ring_day_no`
- `days`: inherited from selected `ring_day_no`
- `class_groups`: missing
- `live_groups`: not proven
- `trips`: not provided
- `riders`: not provided
- `results`: not provided

Important limitation: this endpoint returns HTML that must be parsed. Treat it
as a scrape/parser candidate, not a clean JSON API.

## Parameterized Ring-Day Pattern

Observed difference between schedule-detail requests:

```text
show_no=14905&ring_day_no=3828
show_no=14905&ring_day_no=3829
```

Everything else in the request shape remained the same:

- endpoint: `https://www.horseshowing.com/update_schedule.php`
- method: `POST`
- referrer: `https://www.horseshowing.com/schedule.php`
- content type: `application/x-www-form-urlencoded; charset=UTF-8`
- credentials: `include`
- XMLHttpRequest header present

Conclusion from browser evidence: `update_schedule.php` is parameterized by
`ring_day_no` for selected ring/day schedule fragments. `ring_day_no` values come
from `get_ring_days.php`.
