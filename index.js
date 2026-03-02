import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { entry_db_pool } from "./db/db.js";
import { checkAvailabilityTool } from "./tools/availability-tool.js";
import loadTenantConfigs from "./utils/load-tenant-configs.js";

const app = express();
app.use(express.json());

const toolRegistry = new Map([
  [checkAvailabilityTool.name, checkAvailabilityTool],
]);

const registerToolsOnServer = (server) => {
  for (const tool of toolRegistry.values()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (input) => {
        const result = await tool.execute(input);
        if (
          result &&
          typeof result === "object" &&
          Array.isArray(result.content)
        ) {
          return result;
        }
        const structuredContent =
          result && typeof result === "object" && !Array.isArray(result)
            ? result
            : { result };
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent,
        };
      },
    );
  }
};

const createMcpServer = () => {
  const server = new McpServer({
    name: "hotel-erp-mcp",
    version: "1.0.0",
  });
  registerToolsOnServer(server);
  return server;
};

const transports = new Map();
const servers = new Map();

const isInitializeRequest = (body) =>
  !!body &&
  typeof body === "object" &&
  !Array.isArray(body) &&
  body.method === "initialize";

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
        },
      });

      const server = createMcpServer();
      servers.set(transport, server);

      transport.onclose = async () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
        }
        const boundServer = servers.get(transport);
        if (boundServer) {
          servers.delete(transport);
          try {
            await boundServer.close();
          } catch (error) {
            console.error("Error closing MCP server:", error);
          }
        }
      };

      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP HTTP error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/", (req, res) => {
  const toolsList = Array.from(toolRegistry.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema.shape
      ? Object.keys(tool.inputSchema.shape)
      : undefined,
  }));

  res.json({
    status: "MCP HTTP adapter running",
    tools: toolsList,
  });
});

app.post("/call-tool", async (req, res) => {
  const { toolName, args } = req.body || {};

  try {
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return res
        .status(400)
        .json({ success: false, error: `Unknown tool: ${toolName}` });
    }

    const parsedArgs = tool.inputSchema.safeParse(args || {});
    if (!parsedArgs.success) {
      const firstError = parsedArgs.error.issues?.[0];
      const message = firstError
        ? `${firstError.path.join(".") || "input"}: ${firstError.message}`
        : "Invalid tool arguments";
      return res.status(400).json({ success: false, error: message });
    }

    const result = await tool.execute(parsedArgs.data);
    res.json({ success: true, result });
  } catch (err) {
    console.error("MCP tool error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await entry_db_pool.query("SELECT 1");
    console.log("✅ Database connected");
    await loadTenantConfigs();
    app.listen(PORT, () => {
      console.log(`🌐 Backend + MCP HTTP adapter running on port ${PORT}`);
    });

    console.log("🏨 MCP tools ready");
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

start();
