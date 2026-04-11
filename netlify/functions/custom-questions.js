exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { topic, count = 36 } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const prompt = `Generate exactly ${count} arithmetic questions on the topic: "${topic}".
Return ONLY a JSON array with no explanation, no markdown, no code blocks. Example format:
[{"a": 7, "b": 8, "op": "×", "answer": "56"}, ...]
Rules:
- op must be one of: +, -, ×, ÷
- answer must be a positive whole number as a string
- questions should be appropriate for a primary school child (ages 7–11)
- vary the difficulty slightly across the 36 questions
- ensure answers are whole numbers (no decimals or fractions)`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  try {
    const text = data.content?.[0]?.text ?? "[]";
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
    const questions = arr.slice(0, count).map(q => ({ a: q.a, b: q.b, op: q.op, answer: String(q.answer) }));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions }) };
  } catch {
    return { statusCode: 500, body: "Failed to parse questions" };
  }
};
