import { useState, useEffect } from "react";
import type {
  ApplicationContext,
  PagesContext,
} from "@sitecore-marketplace-sdk/client";
import { useMarketplaceClient } from "@/utils/hooks/useMarketplaceClient";

import IAgent from "@/components/IAgent";

function App() {
  const [pagesContext, setPagesContext] = useState<PagesContext>();
  const { client, error, isInitialized } = useMarketplaceClient();
  const [appContext, setAppContext] = useState<ApplicationContext>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (error) {
      console.error("Error initializing Marketplace client:", error);
      setIsLoading(false);
      return;
    }

    if (!isInitialized || !client) {
      return; 
    }

    console.log("Marketplace client initialized successfully.");

    let pageContextReceived = false;

    // Make a query to retrieve the page context
    client.query("pages.context", {
      subscribe: true,
      onSuccess: (data) => {
        setPagesContext(data);
        pageContextReceived = true;
        setIsLoading(false);
        console.log("Page context received:", data);
      },
      onError: (error) => {
        console.error("Error retrieving page context:", error);
        setIsLoading(false);
      }
    });

    const timeoutId = setTimeout(() => {
      if (!pageContextReceived) {
        console.warn("Page context timeout, proceeding anyway...");
        setIsLoading(false);
      }
    }, 5000); 

    return () => clearTimeout(timeoutId);

  }, [client, error, isInitialized]);

  // Loading state
  if (isLoading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {!isInitialized ? "Initializing Marketplace client..." : "Loading page context..."}
          </p>
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="min-h-screen p-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Error initializing Marketplace client: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen p-8 bg-gray-50">
        <IAgent pagesContext={pagesContext} />
      </main>
    </>
  );
}

export default App;