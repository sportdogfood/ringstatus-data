import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_ORG_ID = process.env.CATALYST_ORG_ID || "700800454";
const DEFAULT_PROJECT_ID = process.env.CATALYST_PROJECT_ID || "5614000000393031";
const CATALYST_BIN =
  process.env.CATALYST_BIN || "C:\\Users\\gombc\\AppData\\Roaming\\npm\\catalyst.cmd";

async function runCatalyst(args, options = {}) {
  const { stdout, stderr } = await execFileAsync(CATALYST_BIN, args, {
    cwd: options.cwd || process.cwd(),
    timeout: options.timeoutMs || 30000,
    maxBuffer: 1024 * 1024,
    shell: true,
    windowsHide: true,
  });

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

const server = new Server(
  {
    name: "catalyst-local",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "catalyst_whoami",
      description: "Return the locally authenticated Catalyst CLI user.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "catalyst_project_list",
      description: "List Catalyst projects available through the local CLI OAuth session.",
      inputSchema: {
        type: "object",
        properties: {
          org_id: {
            type: "string",
            description: "Catalyst organization ID. Defaults to CATALYST_ORG_ID or 700800454.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "catalyst_function_config_help",
      description: "Show local CLI help for Catalyst function configuration in the target project.",
      inputSchema: {
        type: "object",
        properties: {
          org_id: {
            type: "string",
            description: "Catalyst organization ID. Defaults to CATALYST_ORG_ID or 700800454.",
          },
          project_id: {
            type: "string",
            description: "Catalyst project ID. Defaults to CATALYST_PROJECT_ID or horseshowing.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};

  if (request.params.name === "catalyst_whoami") {
    const result = await runCatalyst(["whoami"]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (request.params.name === "catalyst_project_list") {
    const orgId = args.org_id || DEFAULT_ORG_ID;
    const result = await runCatalyst(["--org", orgId, "project:list"]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (request.params.name === "catalyst_function_config_help") {
    const orgId = args.org_id || DEFAULT_ORG_ID;
    const projectId = args.project_id || DEFAULT_PROJECT_ID;
    const result = await runCatalyst([
      "--org",
      orgId,
      "--project",
      projectId,
      "functions:config",
      "--help",
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
