const VOOG_BASE = "https://bruno-tomberg-design.voog.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brunotombergdesign.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "products") {
      const voogResponse = await fetch(
        `${VOOG_BASE}/admin/api/ecommerce/v1/products?include=variants`
      );

      const data = await voogResponse.json();

      return res.status(voogResponse.status).json(data);
    }

    return res.status(200).json({
      ok: true,
      message: "Vercel proxy töötab",
      usage: "Proovi /api/cart?action=products"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
