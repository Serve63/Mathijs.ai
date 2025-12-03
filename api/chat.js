export default async function handler(req, res) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const { messages, model } = parsedBody || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
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
