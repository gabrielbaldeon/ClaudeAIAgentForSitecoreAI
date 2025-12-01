# AI Content Agent for SitecoreAI 
### Next.js + Claude (Anthropic) + Community MCP Server

This repository contains a customized **Next.js** application that integrates an **AI Agent inside SitecoreAI Pages** using the Sitecore Marketplace App framework.

The agent allows editors to use **natural language** to perform content operations in XM Cloud.  
Claude AI generates action plans in JSON, and the **community MCP server** executes those instructions inside Sitecore.

This is a Proof of Concept (POC) demonstrating what is possible when combining:

- Claude AI  
- The MCP protocol  
- The Marketplace Client SDK  
- Sitecore XM Cloud Pages  

---

## ✨ Features

- AI panel embedded directly inside **Sitecore Pages**
- Natural language-to-action conversion powered by **Claude**
- Executes real Sitecore operations using **MCP tools**
- Real-time logs, results, and action plans
- Conversation history for context continuity
- Example workflows (e.g., generating ALT tags for images)
- Fully local Next.js development with hot reload
- Works as a custom app in the Sitecore Marketplace

---

## 🧱 Tech Stack

- **Next.js 14+**
- **React 18+**
- **TypeScript**
- **Anthropic Claude API (`@anthropic-ai/sdk`)**
- **Marketplace Client SDK (`@sitecore-marketplace-sdk/client`, `@sitecore-marketplace-sdk/xmc`)**
- **Community MCP Server** (`@antonytm/mcp-sitecore-server`)
- **Model Context Protocol Client** (`@modelcontextprotocol/sdk`)

---

## 📂 Project Structure (Key Files)

| File | Purpose |
|------|---------|
| `app/api/agent/route.ts` | Core backend logic: creates Claude prompt, parses JSON plan, executes MCP tools, returns results |
| `lib/mcp-client.ts` | Connects to the community MCP server using stdio transport |
| `components/IAgent.tsx` | Frontend UI: handles prompt input, conversation history, logs, results |
| `utils/hooks/useMarketplaceClient.ts` | Initializes Marketplace Client SDK and retrieves Pages context |
| `app/index.tsx` | Main entry point: renders `<IAgent />` inside the Marketplace app container |

---

## 🔧 Environment Variables

Create a `.env.local` file in the project root:

```env
APP_ENV=dev
MCP_DEFAULT_SITE=brandA
XM_LANGUAGE=es

TRANSPORT=stdio
GRAPHQL_ENDPOINT=https://xmc-abcde.sitecorecloud.io/sitecore/api/graph/
GRAPHQL_SCHEMAS=edge,master,core
GRAPHQL_API_KEY=f529e11111111111111ff392
GRAPHQL_HEADERS=
ITEM_SERVICE_DOMAIN=sitecore
ITEM_SERVICE_USERNAME=myuser //create a new user in the CM of sitecoreAI
ITEM_SERVICE_PASSWORD=b
ITEM_SERVICE_SERVER_URL=https://xmc-abcde.sitecorecloud.io/
POWERSHELL_DOMAIN=sitecore
POWERSHELL_USERNAME=myuser 
POWERSHELL_PASSWORD=b
POWERSHELL_SERVER_URL=https://xmc-abcde.sitecorecloud.io/
ANTHROPIC_API_KEY=sk-ant-api03-111111111111111111111111111111111111tWXoww-K7vaBQAA
NODE_TLS_REJECT_UNAUTHORIZED=0
