import { createSitecoreMCPClient } from "@/lib/mcp-client";
import { NextRequest, NextResponse } from "next/server";
import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

// Helper: sleep
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Send messages to Anthropic with simple retry/backoff for rate limits
async function sendAnthropicMessages(opts: {
  model: string;
  messages: any[];
  max_tokens: number;
  maxRetries?: number;
}) {
  const { model, messages, max_tokens, maxRetries = 3 } = opts;
  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= maxRetries) {
    try {
      return await anthropic.messages.create({ model, messages, max_tokens });
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      const body = err?.error || err?.response?.data;
      const isRateLimit =
        status === 429 ||
        body?.type === "rate_limit_error" ||
        (typeof body?.message === "string" &&
          body.message?.toLowerCase?.().includes("rate limit"));

      attempt += 1;
      if (!isRateLimit || attempt > maxRetries) {
        throw err;
      }

      const delay = 500 * Math.pow(2, attempt - 1);
      console.warn(
        `Rate limit detected from Anthropic, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}

// Build a compact tools description to keep input tokens low
function buildToolsDescription(
  toolsWithSchemas: any[],
  maxTools = 20,
  maxChars = 2000
) {
  const parts: string[] = [];
  const slice = toolsWithSchemas.slice(0, maxTools);

  for (const tool of slice) {
    let desc = `- ${tool.name}: ${
      tool.description?.substring(0, 80) || "No description"
    }`;

    try {
      if (tool.schema) {
        const propNames = tool.schema.properties
          ? Object.keys(tool.schema.properties).slice(0, 5)
          : [];
        if (propNames.length > 0) {
          desc += ` (${propNames.join(", ")})`;
        }
      }
    } catch (e) {
      // ignore errors when summarizing schema
    }

    parts.push(desc);
  }

  let result = parts.join("\n");
  if (toolsWithSchemas.length > maxTools) {
    result += `\n...${toolsWithSchemas.length - maxTools} more tools`;
  }

  return result.length > maxChars
    ? result.substring(0, maxChars) + "..."
    : result;
}

// IMPROVED JSON parsing with truncation detection and recovery
function parseClaudeResponse(responseText: string): any {
  console.log("RAW CLAUDE RESPONSE LENGTH:", responseText.length);
  console.log(
    "RAW CLAUDE RESPONSE PREVIEW:",
    responseText.substring(0, 500) + "..."
  );

  // Check if response looks truncated
  const isTruncated =
    !responseText.trim().endsWith("]") && responseText.includes("[");

  if (isTruncated) {
    console.warn("Response appears truncated, attempting recovery...");

    // Try to find the last complete object
    const objects =
      responseText.match(/\{[\s\S]*?\}(?=\s*,\s*\{|\s*\])/g) || [];
    if (objects.length > 0) {
      console.log(
        `Found ${objects.length} complete objects, attempting to reconstruct array...`
      );

      try {
        // Reconstruct JSON array from complete objects
        const reconstructedJson = `[${objects.join(",")}]`;
        const parsed = JSON.parse(reconstructedJson);
        console.log("SUCCESSFULLY RECONSTRUCTED TRUNCATED JSON:", parsed);
        return parsed;
      } catch (recoveryError) {
        console.error("Failed to reconstruct truncated JSON:", recoveryError);
      }
    }
  }

  // Try to extract JSON from markdown code blocks first
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = responseText.match(codeBlockRegex);

  const jsonString = match ? match[1].trim() : responseText.trim();

  console.log("EXTRACTED JSON STRING LENGTH:", jsonString.length);

  try {
    const parsed = JSON.parse(jsonString);
    console.log("SUCCESSFULLY PARSED JSON:", parsed);
    return parsed;
  } catch (error) {
    console.error("JSON PARSE ERROR:", error);

    // Final attempt: try to parse as incomplete JSON and complete it
    if (jsonString.includes("[") && !jsonString.trim().endsWith("]")) {
      try {
        const completedJson = jsonString.replace(/,\s*$/, "") + "]";
        const parsed = JSON.parse(completedJson);
        console.log("SUCCESSFULLY COMPLETED AND PARSED JSON:", parsed);
        return parsed;
      } catch (completionError) {
        console.error("Failed to complete JSON:", completionError);
      }
    }

    throw error;
  }
}

export async function POST(req: NextRequest) {
  let client: any = null;
  const logs: string[] = [];

  try {
    logs.push("Connecting to Sitecore MCP server...");

    // 1. Connect to the Sitecore MCP server
    client = await createSitecoreMCPClient();
    logs.push("MCP connection established successfully");

    // 2. Get all available tools
    logs.push("Fetching available tools from MCP server...");
    const toolsResponse = await client.listTools();
    logs.push(`Available tools: ${toolsResponse.tools.length}`);

    // 3. Get schemas for all tools to build enriched descriptions
    logs.push("Fetching tool schemas...");
    const toolsWithSchemas = [];

    for (const tool of toolsResponse.tools) {
      try {
        const schema = await client.getToolSchema(tool.name);
        toolsWithSchemas.push({ ...tool, schema });
      } catch (error) {
        console.warn(`Could not get schema for ${tool.name}:`, error);
        toolsWithSchemas.push({ ...tool, schema: null });
      }
    }

    // 4. Prepare a more compact tool description
    const toolsDescription = buildToolsDescription(toolsWithSchemas, 20, 2000);

    // 5. Get the prompt and conversation history from the request
    const { prompt, pageContext, conversationHistory } = await req.json();
    logs.push(`Prompt received: "${prompt}"`);
    if (pageContext) {
      logs.push(
        `Page context received with ID: ${
          pageContext.pageInfo?.id || "unknown"
        }`
      );
    }

    // Log conversation history for debugging
    logs.push(
      `Conversation history length: ${conversationHistory?.length || 0}`
    );

    // 6. Build messages for Claude including conversation history
    const messages: any[] = [];

    // Add conversation history if it exists
    if (conversationHistory && conversationHistory.length > 0) {
      // Tomar solo los últimos 10 mensajes para no exceder tokens
      const recentHistory = conversationHistory.slice(-10);
      recentHistory.forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
      logs.push(`Added ${recentHistory.length} previous messages to context`);
    }

    // Add the current prompt with context
    messages.push({
      role: "user",
      content: `You are an AI agent specialized in Sitecore. You have access to the following tools:

${toolsDescription}

CRITICAL INSTRUCTIONS:
1. Analyze the user request in the context of our ongoing conversation and create a DIRECT EXECUTION plan
2. DO NOT ask for confirmations or additional information - USE THE CONTEXT FROM PREVIOUS MESSAGES
3. For each step, provide the exact tool name and required parameters
4. USE EXACT parameter names and structure as shown in each tool's description
5. If page context is relevant (current page ID: ${
        pageContext?.pageInfo?.id || "unknown"
      }), use it appropriately
6. KEEP PowerShell scripts SHORT and SIMPLE - use minimal code
7. If the user is responding to a previous question, CONTINUE WITH THE EXECUTION based on their response
8. Respond ONLY with a VALID JSON array of objects. Do NOT include any other text, markdown, or explanations.
9. Use this EXACT format with double quotes:

[
  {
    "tool": "tool-name-step-1",
    "parameters": {"param1": "value1", "param2": "value2"},
    "reasoning": "Brief explanation"
  }
]

IMPORTANT: Based on the conversation history, continue directly without repeating previous steps or asking for confirmation.

USER REQUEST: ${prompt}`,
    });

    // 7. CALL TO CLAUDE - Full action plan with conversation context
    logs.push(
      "Querying Claude Sonnet 4.5 for execution plan with conversation context..."
    );

    const planMessage = await sendAnthropicMessages({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: messages,
    });

    // Get Claude's response
    let planResponse = "";
    if (planMessage.content[0].type === "text") {
      planResponse = planMessage.content[0].text;
    } else {
      throw new Error(
        `Unsupported content type: ${planMessage.content[0].type}`
      );
    }

    console.log("FULL CLAUDE RESPONSE LENGTH:", planResponse.length);
    logs.push(`Claude response received, length: ${planResponse.length} chars`);

    // Check if response was truncated by Anthropic
    if (planMessage.stop_reason === "max_tokens") {
      console.warn("CLAUDE RESPONSE TRUNCATED DUE TO MAX_TOKENS!");
      logs.push("Warning: Claude response may be truncated due to token limit");
    }

    // 8. Parse the action plan
    let actionPlan;
    try {
      actionPlan = parseClaudeResponse(planResponse);
      logs.push(
        `Action plan parsed successfully with ${actionPlan.length} steps`
      );
      console.log("PARSED ACTION PLAN:", actionPlan);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logs.push(`Error parsing Claude plan: ${errorMessage}`);

      // Create a fallback simple plan
      logs.push("Creating fallback plan...");
      actionPlan = [
        {
          tool: "content_items.list",
          parameters: {
            page: 1,
            pageSize: 10,
            ...(pageContext?.pageInfo?.id && {
              itemId: pageContext.pageInfo.id,
            }),
          },
          reasoning: "Fallback: Basic content listing to understand structure",
        },
      ];
      console.log("FALLBACK ACTION PLAN:", actionPlan);
    }

    // 9. Validate and execute all plan steps
    const results: any[] = [];

    for (const [index, action] of actionPlan.entries()) {
      console.log(`Executing step ${index + 1}:`, action);
      logs.push(
        `Executing step ${index + 1}/${actionPlan.length}: ${action.tool}`
      );
      logs.push(`Parameters: ${JSON.stringify(action.parameters)}`);
      logs.push(`Reasoning: ${action.reasoning}`);

      // Verify tool exists
      const toolExists = toolsResponse.tools.some(
        (t: any) => t.name === action.tool
      );
      if (!toolExists) {
        logs.push(`Tool not available: ${action.tool}`);
        throw new Error(`Tool not available: ${action.tool}`);
      }

      // Execute tool
      try {
        const result = await client.callTool({
          name: action.tool,
          arguments: action.parameters,
        });

        results.push(result);
        logs.push(`Step ${index + 1} completed successfully`);
        console.log(`Step ${index + 1} result:`, result);

        if (result.isError) {
          logs.push(
            `Step ${index + 1} returned error: ${JSON.stringify(result)}`
          );
          throw new Error(
            `Error in step ${index + 1}: ${JSON.stringify(result)}`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logs.push(`Error executing tool ${action.tool}: ${errorMessage}`);
        console.error(`Tool execution error:`, error);
        throw new Error(`Error executing tool ${action.tool}: ${errorMessage}`);
      }
    }

    // 10. Generate final response with conversation context
    logs.push("Generating final response with conversation context...");

    const finalResponseMessages = [
      ...messages,
      {
        role: "user",
        content: `The user requested: "${prompt}"

I executed ${results.length} steps successfully with these results:

${JSON.stringify(results, null, 2)}

Based on our conversation history and the current results, please generate a comprehensive, friendly response that continues our conversation naturally. DO NOT ask for confirmation if we're in the middle of a task - just continue with the next logical steps.`,
      },
    ];

    const finalResponse = await sendAnthropicMessages({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      messages: finalResponseMessages,
    });

    let finalText = "";
    if (finalResponse.content[0].type === "text") {
      finalText = finalResponse.content[0].text;
    } else {
      finalText = "Execution completed successfully.";
    }

    logs.push("🎉 Execution completed successfully");

    return NextResponse.json({
      success: true,
      logs,
      actionPlan,
      results,
      response: finalText,
      modelUsed: "claude-sonnet-4-5-20250929",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("FINAL ERROR IN AI AGENT:", errorMessage);
    console.error("ERROR STACK:", error.stack);

    return NextResponse.json(
      {
        success: false,
        error: "AI agent error",
        logs,
        details: errorMessage,
        modelUsed: "claude-sonnet-4-5-20250929",
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    if (client) {
      try {
        await client.close();
        console.log("MCP client closed successfully");
      } catch (closeError) {
        const errorMessage =
          closeError instanceof Error ? closeError.message : "Unknown error";
        console.error("Error closing MCP client:", errorMessage);
      }
    }
  }
}

// OPTIONS method for CORS
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}
