exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { imageBase64, mediaType = "image/jpeg" } = JSON.parse(event.body || "{}");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "No API key" };
  if (!imageBase64) return { statusCode: 400, body: "No image provided" };

  const prompt = `Look at this maths worksheet image. Extract every arithmetic question you can see.
For each question, identify: the first number (a), the operation, and the second number (b).
Only include questions where the answer is a positive whole number.
Return ONLY a JSON array with no explanation:
[{"a": 5, "b": 3, "op": "+", "answer": "8"}, ...]
If you cannot read a question clearly, skip it.
op must be one of: +, -, ×, ÷
Aim to extract up to 36 questions.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const data = await res.json();
  try {
    const text = data.content?.[0]?.text ?? "[]";
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
    const questions = arr.slice(0, 36).map(q => ({ a: q.a, b: q.b, op: q.op, answer: String(q.answer) }));
    if (questions.length === 0) return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: [], error: "No questions found in image" }) };
    // Pad to 36 by repeating if needed
    while (questions.length < 36) questions.push(...questions.slice(0, 36 - questions.length));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: questions.slice(0, 36) }) };
  } catch {
    return { statusCode: 500, body: "Failed to parse questions from image" };
  }
};
