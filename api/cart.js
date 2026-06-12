const VOOG_BASE = "https://bruno-tomberg-design.voog.com";

function sendCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brunotombergdesign.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readBody(req) {
  if (req.body) return req.body;

  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

async function voogFetch(path, options = {}) {
  const response = await fetch(`${VOOG_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

export default async function handler(req, res) {
  sendCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const action = url.searchParams.get("action");

    // TEST: toodete nimekiri
    // /api/cart?action=products
    if (req.method === "GET" && action === "products") {
      const result = await voogFetch(
        "/admin/api/ecommerce/v1/products?include=variants"
      );

      return res.status(result.status).json(result.data);
    }

    // CARTI LUGEMINE
    // /api/cart?uuid=OSTUKORVI_UUID
    if (req.method === "GET") {
      const uuid = url.searchParams.get("uuid");

      if (!uuid) {
        return res.status(200).json({
          ok: true,
          message: "Proxy töötab",
          usage: {
            products: "/api/cart?action=products",
            createCart: "POST /api/cart body: { product_id: 2931504, quantity: 1 }",
            getCart: "/api/cart?uuid=..."
          }
        });
      }

      const result = await voogFetch(
        `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`
      );

      return res.status(result.status).json(result.data);
    }

    // UUE CARTI LOOMINE ÜHE TOOTEGA
    // POST /api/cart
    // body: { "product_id": 2931504, "quantity": 1 }
    if (req.method === "POST") {
      const body = await readBody(req);

      const product_id = Number(body.product_id);
      const quantity = Number(body.quantity || 1);

      if (!product_id) {
        return res.status(400).json({
          ok: false,
          error: "product_id puudub"
        });
      }

      const result = await voogFetch(
        "/admin/api/ecommerce/v1/carts?include=items,payment_methods",
        {
          method: "POST",
          body: JSON.stringify({
            items: [
              {
                product_id,
                quantity
              }
            ],
            currency: "EUR",
            is_initial: true
          })
        }
      );

      return res.status(result.status).json(result.data);
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
