exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { history, name } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const recent = (history || []).slice(0, 10);
  const summary = recent.map(s =>
    `${s.date}: ${s.levelTitle} (${s.phase}) — ${s.accuracy}% accuracy, slowest: ${(s.slowest || []).map(q => q.label).join(", ")}${s.wrong?.length ? `, wrong: ${s.wrong.slice(0,5).join(", ")}` : ""}`
  ).join("\n");

  const prompt = `You are analysing a child's maths practice data. The child's name is ${name || "the child"}.
Here are their recent sessions:
${summary}

In 1–2 short, friendly sentences, identify the most notable pattern (e.g. a type of question they keep struggling with, or something they've improved at). Address ${name || "them"} directly. Be encouraging and specific.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 120, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const insight = data.content?.[0]?.text ?? "";
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ insight }) };
};
