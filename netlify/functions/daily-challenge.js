exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { levelTitle, sectionName, skill } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const prompt = `A child is practising "${levelTitle}" in the "${sectionName}" section (skill: "${skill}").
Generate ONE daily bonus maths question that is slightly harder than their current level.
Return ONLY a JSON object with no explanation:
{"a": 14, "b": 9, "op": "+", "answer": "23", "flavour": "Beat today's bonus challenge!"}
Rules:
- op must be one of: +, -, ×, ÷
- answer must be a positive whole number as a string
- flavour is a short motivating sentence (max 8 words, no mention of "missing number")
- flavour examples: "Can you crack today's challenge?", "Beat the daily quest!", "Today's bonus — go for it!", "Show what you know today!"
- the question must be straightforward (a op b = answer), NOT a fill-in-the-middle format
- the question should be achievable but slightly harder than their current level`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 100, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  try {
    const text = data.content?.[0]?.text ?? "{}";
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) };
  } catch {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 14, b: 9, op: "+", answer: "23", flavour: "Beat today's bonus challenge!" }) };
  }
};
