const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const { email } = JSON.parse(event.body || "{}");
  if (!email) return { statusCode: 400, body: JSON.stringify({ active: false, error: "No email provided" }) };

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ active: false, error: "Stripe not configured" }) };

  try {
    const stripe = new Stripe(apiKey, { apiVersion: "2023-10-16" });

    // Find customer by email
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
    if (!customers.data.length) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) };
    }

    // Check for active subscription
    const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 1 });
    const active = subs.data.length > 0;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ active: false, error: err.message }) };
  }
};
