const BING_SEARCH_ENDPOINT = process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search";
const BING_SEARCH_KEY = process.env.BING_SEARCH_KEY || process.env.BING_SUBSCRIPTION_KEY;

async function fetchWebResults(query) {
  if (!BING_SEARCH_KEY || !query) return null;
  try {
    const url = `${BING_SEARCH_ENDPOINT}?count=3&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": BING_SEARCH_KEY,
      },
    });
    if (!response.ok) {
      console.warn("Web search failed", await response.text());
      return null;
    }
    const data = await response.json();
    const items = data?.webPages?.value || [];
    if (!items.length) return null;
    return items
      .slice(0, 3)
      .map((item, idx) => `${idx + 1}. ${item.name} — ${item.snippet} (URL: ${item.url})`)
      .join("\n");
  } catch (err) {
    console.warn("Web search error", err);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const apiKey = process.env.open_ai_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OpenAI API key (set open_ai_key or OPENAI_API_KEY)");
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const { messages, model, webSearch } = parsedBody || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Prepare messages; optionally enrich with web search context
    let enrichedMessages = [...messages];

    if (webSearch) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
      const query = lastUser?.content || "";
      const webContext = await fetchWebResults(query);
      if (webContext) {
        enrichedMessages = [
          {
            role: "system",
            content:
              "Je hebt toegang tot recente webresultaten. Gebruik deze samenvatting voor je antwoord als het relevant is:\n" +
              webContext +
              "\nNoem geen niet-bestaande links.",
          },
          ...messages,
        ];
      }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: enrichedMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(errorText);
      throw new Error(errorText || "OpenAI API request failed");
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message ? error.message : "Unexpected error";
    return res.status(500).json({ error: message });
  }
}
