exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { name, goal, deadline, masteredCount, totalLevels, currentLevel, history, streak } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };

  const today = new Date().toLocaleDateString("en-GB");
  const recent = (history || []).slice(0, 7);
  const sessionSummary = recent.map(s => `${s.date}: ${s.levelTitle} — ${s.accuracy}%${s.passed ? " ✓" : " ✗"}`).join("\n");

  const prompt = `You are assessing a child's progress toward their maths goal.
Child: ${name || "the child"}
Goal: "${goal}"
Deadline: ${deadline || "not set"}
Today: ${today}
Progress: ${masteredCount} of ${totalLevels} levels mastered
Current level: ${currentLevel}
Streak: ${streak} day(s)
Recent sessions:
${sessionSummary || "No sessions yet."}

Give an honest, encouraging 2–3 sentence assessment of whether they are on track to meet their goal by the deadline. Be specific and actionable. Speak to the parent.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  const assessment = data.content?.[0]?.text ?? "";
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment }) };
};
