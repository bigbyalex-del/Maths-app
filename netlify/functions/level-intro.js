exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { levelTitle, sectionName, skill } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const prompt = `You are a warm, encouraging maths tutor for a child aged 7–10.
They are about to start a new topic: "${levelTitle}" (part of "${sectionName}").
The skill they will practise is: "${skill}".
Write exactly 2 short, friendly sentences to introduce this topic and get them excited. Use simple language. Be encouraging and fun. No bullet points.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 120, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const intro = data.content?.[0]?.text ?? "";
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intro }) };
};
