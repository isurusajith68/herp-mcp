import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");

const sampleInput = {
  orgId: 1,
  propertyId: 101,
  checkIn: "2026-03-01",
  checkOut: "2026-03-03",
};

const client = new Client(
  { name: "tool-smoke-test", version: "1.0.0" },
  { capabilities: {} },
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["index.js"],
  cwd: projectRoot,
  stderr: "inherit",
});

try {
  await client.connect(transport);

  const toolsResponse = await client.listTools();
  const toolNames = toolsResponse.tools.map((tool) => tool.name);
  console.log("TOOLS:", toolNames.join(", "));

  const result = await client.callTool({
    name: "check_availability",
    arguments: sampleInput,
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Test failed:", error);
  process.exitCode = 1;
} finally {
  await transport.close();
}
