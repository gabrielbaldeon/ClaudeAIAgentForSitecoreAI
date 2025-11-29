"use client";

import { useState } from "react";

interface IAgentProps {
  pagesContext?: any;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function IAgent({ pagesContext }: IAgentProps) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);

  const handleExecute = async () => {
    setLoading(true);
    setLogs([]);
    setResponse(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          pageContext: pagesContext,
          conversationHistory, // Send full history
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResponse(data);
        setLogs(data.logs);

        // Update Conversation History
        const newHistory = [
          ...conversationHistory,
          { role: "user", content: prompt, timestamp: new Date() },
          { role: "assistant", content: data.response, timestamp: new Date() },
        ];
        setConversationHistory(newHistory);
      } else {
        setLogs([...data.logs, `Error: ${data.error}`]);
      }
    } catch (error) {
      setLogs([...logs, `Conection Error: ${error}`]);
    } finally {
      setLoading(false);
      setPrompt("");
    }
  };

  const clearHistory = () => {
    setConversationHistory([]);
    setResponse(null);
    setLogs([]);
  };

  return (
    <div
      className="p-6 max-w-4xl mx-auto"
      style={{ fontFamily: "Tahoma", fontSize: 12 }}
    >
      <div className="text-xs text-gray-500 mt-1" style={{ marginBottom: 10 }}>
        Current Page ID: {pagesContext?.pageInfo?.id || "unknown"}
      </div>

      {/* Conversation History */}
      {conversationHistory.length > 0 && (
        <div className="mb-6" style={{ marginTop: 20, marginBottom: 20 }}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold">Conversation:</h3>
            <button
              onClick={clearHistory}
              className="text-xs bg-red-500 text-white px-2 py-1 rounded"
            >
              Clear History
            </button>
          </div>
          <div className="bg-gray-50 p-3 rounded max-h-60 overflow-y-auto">
            {conversationHistory.map((msg, index) => (
              <div
                key={index}
                className={`mb-2 p-2 rounded ${
                  msg.role === "user" ? "bg-blue-100" : "bg-green-100"
                }`}
              >
                <strong>{msg.role === "user" ? "You: " : "Assistant: "}</strong>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <textarea
          style={{ width: "90%", fontFamily: "Tahoma" }}
          value={prompt}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="¿What do you want to do in Sitecore?"
          className="w-full p-3 border rounded h-20"
          disabled={loading}
        />
      </div>

      <button
        style={{ marginTop: 8 }}
        onClick={handleExecute}
        disabled={loading}
        className="bg-purple-600 text-white px-4 py-2 rounded disabled:bg-gray-400 mb-4"
      >
        {loading ? "Thinking..." : "Execute"}
      </button>

      {logs.length > 0 && (
        <div className="mt-6">
          <h3 className="font-bold mb-2">Execution Logs:</h3>
          <div className="bg-gray-100 p-3 rounded max-h-60 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono mb-1">
                • {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {response && (
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="font-bold mb-2">Response:</h3>
            <div className="bg-white p-3 rounded border">
              {response.response}
            </div>
          </div>

          {response.actionPlan && (
            <div>
              <h3 className="font-bold mb-2">Action Plan:</h3>
              <pre className="bg-gray-100 p-3 rounded overflow-x-auto">
                {JSON.stringify(response.actionPlan, null, 2)}
              </pre>
            </div>
          )}

          {response.results && (
            <div>
              <h3 className="font-bold mb-2">Results:</h3>
              <pre className="bg-gray-100 p-3 rounded overflow-x-auto">
                {JSON.stringify(response.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
