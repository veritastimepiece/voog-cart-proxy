const VOOG_BASE = "https://bruno-tomberg-design.voog.com";

function sendCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brunotombergdesign.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
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

function normalizeCartItems(cart) {
  const items = Array.isArray(cart?.items) ? cart.items : [];

  return items
    .map(item => {
      const product_id =
        item.product_id ||
        item.product?.id ||
        item.product?.product_id;

      const quantity = Number(item.quantity || 1);

      if (!product_id) return null;

      return {
        product_id: Number(product_id),
        quantity
      };
    })
    .filter(Boolean);
}

function addOrIncreaseItem(items, product_id, quantity) {
  const existingItem = items.find(item => {
    return Number(item.product_id) === Number(product_id);
  });

  if (existingItem) {
    existingItem.quantity = Number(existingItem.quantity || 1) + Number(quantity || 1);
    return items;
  }

  items.push({
    product_id: Number(product_id),
    quantity: Number(quantity || 1)
  });

  return items;
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
    // GET /api/cart?action=products
    if (req.method === "GET" && action === "products") {
      const result = await voogFetch(
        "/admin/api/ecommerce/v1/products?include=variants"
      );

      return res.status(result.status).json(result.data);
    }

    // CARTI LUGEMINE
    // GET /api/cart?uuid=OSTUKORVI_UUID
    if (req.method === "GET") {
      const uuid = url.searchParams.get("uuid");

      if (!uuid) {
        return res.status(200).json({
          ok: true,
          message: "Proxy töötab",
          usage: {
            products: "/api/cart?action=products",
            createOrUpdateCart:
              "POST /api/cart body: { uuid: 'optional', product_id: 2931504, quantity: 1 }",
            getCart: "/api/cart?uuid=...",
            checkout: "POST /api/cart?action=checkout body: { uuid: '...' }"
          }
        });
      }

      const result = await voogFetch(
        `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`
      );

      return res.status(result.status).json(result.data);
    }

    // POST:
    // 1. POST /api/cart — loo uus cart või uuenda olemasolevat
    // 2. POST /api/cart?action=checkout — alusta checkouti
    if (req.method === "POST") {
      const body = await readBody(req);

      // CHECKOUT
      if (action === "checkout") {
        const uuid = body.uuid;

        if (!uuid) {
          return res.status(400).json({
            ok: false,
            error: "uuid puudub"
          });
        }

        const result = await voogFetch(
          `/admin/api/ecommerce/v1/carts/${uuid}/checkout`,
          {
            method: "POST",
            body: JSON.stringify({})
          }
        );

        return res.status(result.status).json(result.data);
      }

      const uuid = body.uuid || null;
      const product_id = Number(body.product_id);
      const quantity = Number(body.quantity || 1);

      if (!product_id) {
        return res.status(400).json({
          ok: false,
          error: "product_id puudub"
        });
      }

      // Kui uuid puudub, loome uue cart'i.
      if (!uuid) {
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

      // Kui uuid on olemas, loeme olemasoleva cart'i.
      const existingCartResult = await voogFetch(
        `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`
      );

      // Kui vana cart'i ei saa lugeda, loome uue cart'i.
      if (!existingCartResult.ok) {
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

      const existingItems = normalizeCartItems(existingCartResult.data);
      const updatedItems = addOrIncreaseItem(existingItems, product_id, quantity);

      // Uuendame olemasolevat cart'i.
      const updateResult = await voogFetch(
        `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`,
        {
          method: "PUT",
          body: JSON.stringify({
            items: updatedItems,
            currency: "EUR"
          })
        }
      );

      return res.status(updateResult.status).json(updateResult.data);
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
