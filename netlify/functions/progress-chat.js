exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { question, name, history, masteredCount, totalLevels, currentLevel, streak } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const recent = (history || []).slice(0, 14);
  const sessionSummary = recent.map(s =>
    `${s.date}: ${s.levelTitle} (${s.phase}) — ${s.accuracy}% accuracy${s.seconds ? `, ${s.seconds}s` : ""}${s.passed ? " ✓" : " ✗"}`
  ).join("\n");

  const prompt = `You are a friendly maths tutor giving a parent an update on their child's progress.
Child's name: ${name || "their child"}
Levels mastered: ${masteredCount} of ${totalLevels}
Current level: ${currentLevel}
Current streak: ${streak} days
Recent sessions:
${sessionSummary || "No sessions yet."}

Parent's question: "${question}"

Answer conversationally in 2–4 sentences. Be specific about what you can see in the data. Be honest but encouraging.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const response = data.content?.[0]?.text ?? "";
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) };
};
