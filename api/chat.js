export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const { messages, model } = parsedBody || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("Missing OPENAI_API_KEY environment variable");
      return res.status(500).json({ error: "AI request failed" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content });
  } catch (error) {
    console.error("Chat handler error:", error);
    return res.status(500).json({ error: "AI request failed" });
  }
}
