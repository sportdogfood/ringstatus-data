# horseshowing_discovery

Clean read-only Catalyst discovery/parser function for Horseshowing/WEC.

This function is intended to replace or sit beside the hardcoded
`horseshowing_proxy` experiments. It does not write to Datastore.

## Route

```text
/discover?endpoint=<endpoint>&show_no=14905
```

Supported endpoints:

- `show`
- `ring-days`
- `update-schedule`
- `rings`
- `orders`
- `counts`
- `class-oog`

Examples:

```text
/discover?endpoint=ring-days&show_no=14905
/discover?endpoint=update-schedule&show_no=14905&ring_day_no=3828
/discover?endpoint=rings&show_no=14905
/discover?endpoint=orders&show_no=14905
/discover?endpoint=counts&show_no=14905
/discover?endpoint=class-oog&class_no=28587
```

For session-sensitive calls, pass:

```text
x-hscom-phpsessid: <PHPSESSID>
```

The function builds upstream cookies from:

- inbound `cookie`, if present
- `PHPSESSID=<x-hscom-phpsessid>`, if present
- `HscomShowNo=<show_no>`, if present

## Local Test

```powershell
npm install
node test-parsers.mjs
```

## Guardrails

- Development only until explicitly promoted.
- No Datastore writes.
- No Production deploy.
- Do not add guessed endpoints or fields.
- Preserve parser warnings, especially `NOT A POSTED ORDER` from `class_oog.php`.
