exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { levelTitle, sectionName, skill } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const prompt = `You are a friendly maths tutor for a child aged 7–10.
Topic: "${levelTitle}" (${sectionName}) — skill: "${skill}".
Write EXACTLY 1 sentence (max 20 words) to get them excited. Simple words, no emoji, no punctuation tricks. Just one punchy sentence.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 120, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const intro = data.content?.[0]?.text ?? "";
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intro }) };
};
