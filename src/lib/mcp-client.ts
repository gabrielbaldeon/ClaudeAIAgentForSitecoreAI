'use server';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpClient {
  callTool: (params: { name: string; arguments: any }) => Promise<any>;
  listTools: () => Promise<any>;
  getToolSchema: (toolName: string) => Promise<any>;
  close: () => Promise<void>;
}

export async function createSitecoreMCPClient(): Promise<McpClient> {
  
  const env: Record<string, string> = {
    ...process.env,
    TRANSPORT: 'stdio',
    GRAPHQL_ENDPOINT: process.env.GRAPHQL_ENDPOINT || '',
    GRAPHQL_SCHEMAS: process.env.GRAPHQL_SCHEMAS || '',
    GRAPHQL_API_KEY: process.env.GRAPHQL_API_KEY || '',
    GRAPHQL_HEADERS: process.env.GRAPHQL_HEADERS || '',
    ITEM_SERVICE_DOMAIN: process.env.ITEM_SERVICE_DOMAIN || '',
    ITEM_SERVICE_USERNAME: process.env.ITEM_SERVICE_USERNAME || '',
    ITEM_SERVICE_PASSWORD: process.env.ITEM_SERVICE_PASSWORD || '',
    ITEM_SERVICE_SERVER_URL: process.env.ITEM_SERVICE_SERVER_URL || '',
    POWERSHELL_DOMAIN: process.env.POWERSHELL_DOMAIN || '',
    POWERSHELL_USERNAME: process.env.POWERSHELL_USERNAME || '',
    POWERSHELL_PASSWORD: process.env.POWERSHELL_PASSWORD || '',
    POWERSHELL_SERVER_URL: process.env.POWERSHELL_SERVER_URL || '',
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '',
  };

  console.log('🔌 Starting MCP server with endpoint:', env.GRAPHQL_ENDPOINT);

  const transport = new StdioClientTransport({
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['@antonytm/mcp-sitecore-server@latest'],
    env: env
  });

  const client = new Client(
    {
      name: 'sitecore-mcp-client',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ MCP client connected successfully');

    const toolsList = await client.listTools();

    return {
      callTool: async (params: { name: string; arguments: any }) => {
        return await client.callTool(params);
      },
      listTools: async () => {
        return toolsList;
      },
      getToolSchema: async (toolName: string) => {
        const tool = toolsList.tools.find((t: any) => t.name === toolName);
        if (!tool) {
          throw new Error(`Herramienta ${toolName} no encontrada`);
        }
        
        if (tool.inputSchema) {
          return tool.inputSchema;
        } else if (tool.parameters) {
          return tool.parameters;
        } else {
          return {
            name: tool.name,
            description: tool.description,
            parameters: inferParametersFromToolName(tool.name)
          };
        }
      },
      close: async () => {
        await client.close();
      }
    };
  } catch (error) {
    console.error('Failed to connect MCP client:', error);
    
    try {
      await transport.close();
    } catch (closeError) {
      console.error('Error closing transport:', closeError);
    }
    
    throw new Error(`MCP connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inferParametersFromToolName(toolName: string): any {
  const parameterPatterns: { [key: string]: any } = {
    'item-service-get-item-by-path': {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    },
    'item-service-edit-item': {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            ItemID: { type: 'string' },
            Fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  Name: { type: 'string' },
                  Value: { type: 'string' }
                }
              }
            }
          },
          required: ['ItemID', 'Fields']
        }
      },
      required: ['data']
    },
    'item-service-update-item-field': {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        fieldName: { type: 'string' },
        fieldValue: { type: 'string' }
      },
      required: ['itemId', 'fieldName', 'fieldValue']
    }
  };

  for (const [pattern, schema] of Object.entries(parameterPatterns)) {
    if (toolName.includes(pattern) || pattern.includes(toolName)) {
      return schema;
    }
  }

  return {
    type: 'object',
    properties: {},
    required: []
  };
}

// Función de utilidad para verificar la conexión a Sitecore
export async function testSitecoreConnection(): Promise<boolean> {
  try {
    // Usar el endpoint correcto para la verificación
    const response = await fetch(process.env.GRAPHQL_ENDPOINT || '', {
      method: 'GET',
      headers: {
        'sc_apikey': process.env.GRAPHQL_API_KEY || ''
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Sitecore connection test failed:', error);
    return false;
  }
}