# Cleanest RingStatus App Hosting Architecture

## Architecture

```text
ringstatus repo
= source apps / Vite projects

ringstatus-data repo
= built app output + JSON data

Cloudflare Worker
= clean public app router

tack.ringstatus.com / ringer.ringstatus.com / wef.ringstatus.com
= app-specific public hosts
```

## Public URLs

```text
https://tack.ringstatus.com/
https://ringer.ringstatus.com/
https://wef.ringstatus.com/
```

## Internal Worker Resolution

```text
/docs/tack/index.html
/docs/ringer/index.html
/docs/wef/index.html
```

## Working Model

Build app source in `ringstatus`, publish only the compiled static output into `ringstatus-data`, then let the Cloudflare Worker serve each app through clean app-specific subdomains.

