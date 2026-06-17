# Catalyst Local MCP

Local MCP wrapper for the Zoho Catalyst CLI. This uses the machine's local
`catalyst` login instead of the ChatGPT Catalyst connector OAuth grant.

Current tools are read-only:

- `catalyst_whoami`
- `catalyst_project_list`
- `catalyst_function_config_help`

Verified local defaults:

- Org ID: `700800454`
- Horseshowing project ID: `5614000000393031`
- CLI user: `philip@sportdogfood.com`

To load this as a persistent Codex MCP server, add this block to
`C:\Users\gombc\.codex\config.toml` and restart/reload Codex:

```toml
[mcp_servers.catalyst_local]
command = 'C:\Program Files\nodejs\node.exe'
args = ['C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus-data\mcp\catalyst-local\server.mjs']
startup_timeout_sec = 30

[mcp_servers.catalyst_local.env]
CATALYST_ORG_ID = '700800454'
CATALYST_PROJECT_ID = '5614000000393031'
CATALYST_BIN = 'C:\Users\gombc\AppData\Roaming\npm\catalyst.cmd'
```

Run locally:

```powershell
cd "C:\Users\gombc\OneDrive - Sport Dog Food\github\repos\ringstatus-data\mcp\catalyst-local"
npm install
npm start
```
