exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { question, wrongAnswer, correctAnswer } = body;
  if (!question || !correctAnswer) {
    return { statusCode: 400, body: "Missing fields" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "API key not configured" };
  }

  const wrongPart = wrongAnswer
    ? `The child answered ${wrongAnswer}, which is wrong.`
    : "The child left it blank.";

  const prompt = `You are a warm, encouraging maths tutor helping a child aged 7–10.
The child was asked: ${question} = ?
${wrongPart}
The correct answer is: ${correctAnswer}.
Give a short, kind, child-friendly hint (1–2 sentences) that helps them understand why the answer is ${correctAnswer}. Use simple, everyday language. Be positive and encouraging. No equations or formulas.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return { statusCode: 502, body: "Claude API error" };
    }

    const data = await response.json();
    const hint = data.content?.[0]?.text ?? "Keep trying — you can do it!";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hint }),
    };
  } catch (err) {
    console.error("Fetch error:", err);
    return { statusCode: 502, body: "Network error" };
  }
};
