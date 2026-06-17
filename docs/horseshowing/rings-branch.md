# Rings Branch Evidence

Authority: browser-captured request and payload evidence. Do not infer additional
contracts beyond the captured request/response.

## Branch

```text
show.php?show=14905 -> rings.php?show=14905 -> get_rings.php
```

## Verified Request

```js
fetch("https://www.horseshowing.com/get_rings.php", {
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
  "referrer": "https://www.horseshowing.com/rings.php?show=14905",
  "body": "show_no=14905",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});
```

## Verified Payload Shape

Top-level response is a JSON array of current ring status rows.

```json
{
  "show_no": "14905",
  "class_no": "28785",
  "ring_no": "665",
  "ring_day_no": "3834",
  "ring": "Indoor 4 - Gary",
  "day": "Saturday, June 6, 2026",
  "class": "756) $500 1.10m Amateur Jumper II.2d",
  "entry": "#2017, United Del Coco<br>In ring at 2:48pm",
  "total": "29",
  "n_to_go": "22",
  "n_gone": "7",
  "time": "2:48pm",
  "timestamp": 1780771717,
  "elapsed": 37,
  "orders": [],
  "gone": [],
  "n_standings": "31",
  "type": "X"
}
```

Fields observed:

- `show_no`
- `class_no`
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
- `n_standings`
- `type`

## Capability Mapping

- `rings`: available as current active ring rows
- `days`: available as current active ring rows
- `classes`: partial/current active classes
- `entries`: partial/current entry text
- `go_times`: partial/current in-ring time
- `live_trips`: partial/current status
- `trips`: not full history in observed sample
- `riders`: not observed
- `results`: not observed, but `n_standings` may indicate standings count or result-related status

Important limitation: this is a live/current ring-status payload, not a full ring
schedule or complete trip history.

## Browser Refresh Behavior

Ring Status branch completed first-pass capture.

Important operational note: the browser constantly pings:

```text
https://www.horseshowing.com/get_rings.php
```

Treat `get_rings.php` as the current ring-status polling endpoint. Polling
cadence still needs live timing measurement before reproducing it in Catalyst
JobScheduling or any worker.
