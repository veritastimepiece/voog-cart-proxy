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

function getCleanItemsFromCart(cart) {
  const items = Array.isArray(cart?.items) ? cart.items : [];

  return items
    .map(item => {
      const product_id = Number(item.product_id || item.product?.id);
      const quantity = Number(item.quantity || 1);

      if (!product_id) return null;

      const cleanItem = {
        product_id,
        quantity
      };

      if (item.note) {
        cleanItem.note = item.note;
      }

      return cleanItem;
    })
    .filter(Boolean);
}

function addProductToItems(items, product_id, quantity) {
  const existing = items.find(item => {
    return Number(item.product_id) === Number(product_id);
  });

  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + Number(quantity || 1);
    return items;
  }

  items.push({
    product_id: Number(product_id),
    quantity: Number(quantity || 1)
  });

  return items;
}

function setProductQuantityInItems(items, product_id, quantity) {
  const cleanQuantity = Number(quantity || 0);

  if (cleanQuantity <= 0) {
    return items.filter(item => {
      return Number(item.product_id) !== Number(product_id);
    });
  }

  const existing = items.find(item => {
    return Number(item.product_id) === Number(product_id);
  });

  if (existing) {
    existing.quantity = cleanQuantity;
    return items;
  }

  items.push({
    product_id: Number(product_id),
    quantity: cleanQuantity
  });

  return items;
}

function removeProductFromItems(items, product_id) {
  return items.filter(item => {
    return Number(item.product_id) !== Number(product_id);
  });
}

async function createCart(product_id, quantity) {
  return await voogFetch(
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
}

async function getCart(uuid) {
  return await voogFetch(
    `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`
  );
}

async function saveCartItems(uuid, items) {
  return await voogFetch(
    `/admin/api/ecommerce/v1/carts/${uuid}?include=items,payment_methods`,
    {
      method: "PUT",
      body: JSON.stringify({
        items,
        is_initial: true
      })
    }
  );
}

async function updateCart(uuid, product_id, quantity) {
  const existingCartResult = await getCart(uuid);

  if (!existingCartResult.ok) {
    return await createCart(product_id, quantity);
  }

  const existingCart = existingCartResult.data;

  if (existingCart.status && existingCart.status !== "created") {
    return await createCart(product_id, quantity);
  }

  const existingItems = getCleanItemsFromCart(existingCart);
  const updatedItems = addProductToItems(existingItems, product_id, quantity);

  return await saveCartItems(uuid, updatedItems);
}

async function setCartItemQuantity(uuid, product_id, quantity) {
  const existingCartResult = await getCart(uuid);

  if (!existingCartResult.ok) {
    return existingCartResult;
  }

  const existingItems = getCleanItemsFromCart(existingCartResult.data);
  const updatedItems = setProductQuantityInItems(
    existingItems,
    product_id,
    quantity
  );

  return await saveCartItems(uuid, updatedItems);
}

async function removeCartItem(uuid, product_id) {
  const existingCartResult = await getCart(uuid);

  if (!existingCartResult.ok) {
    return existingCartResult;
  }

  const existingItems = getCleanItemsFromCart(existingCartResult.data);
  const updatedItems = removeProductFromItems(existingItems, product_id);

  return await saveCartItems(uuid, updatedItems);
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
            createCart:
              "POST /api/cart body: { product_id: 2931504, quantity: 1 }",
            updateCart:
              "POST /api/cart body: { uuid: '...', product_id: 2931504, quantity: 1 }",
            setQuantity:
              "POST /api/cart?action=setQuantity body: { uuid: '...', product_id: 2931504, quantity: 2 }",
            removeItem:
              "POST /api/cart?action=removeItem body: { uuid: '...', product_id: 2931504 }",
            getCart: "/api/cart?uuid=...",
            checkout:
              "POST /api/cart?action=checkout body: { uuid: '...' }"
          }
        });
      }

      const result = await getCart(uuid);

      return res.status(result.status).json(result.data);
    }

    if (req.method === "POST") {
      const body = await readBody(req);

// CHECKOUT
// POST /api/cart?action=checkout
// body: { "uuid": "OSTUKORVI_UUID" }
if (action === "checkout") {
  const uuid = body.uuid;

  if (!uuid) {
    return res.status(400).json({
      ok: false,
      error: "uuid puudub"
    });
  }

  // Loeme enne cart'i, et võtta sealt olemasolev maksemeetod.
  const cartResult = await getCart(uuid);

  if (!cartResult.ok) {
    return res.status(cartResult.status).json(cartResult.data);
  }

  const cart = cartResult.data;
  const paymentMethod = Array.isArray(cart.payment_methods)
    ? cart.payment_methods[0]
    : null;

  const gateway_code =
    cart.gateway_code ||
    paymentMethod?.gateway_code ||
    paymentMethod?.code ||
    "offline";

  const payment_method =
    cart.payment_method ||
    paymentMethod?.code ||
    "offline";

  const checkoutBody = {
    cart: {
      gateway_code,
      payment_method
    }
  };

  console.log("Checkout body:", checkoutBody);

  const result = await voogFetch(
    `/admin/api/ecommerce/v1/carts/${uuid}/checkout`,
    {
      method: "POST",
      body: JSON.stringify(checkoutBody)
    }
  );

  return res.status(result.status).json(result.data);
}

      // KOGUSE MUUTMINE
      // POST /api/cart?action=setQuantity
      // body: { uuid, product_id, quantity }
      if (action === "setQuantity") {
        const uuid = body.uuid;
        const product_id = Number(body.product_id);
        const quantity = Number(body.quantity || 0);

        if (!uuid) {
          return res.status(400).json({
            ok: false,
            error: "uuid puudub"
          });
        }

        if (!product_id) {
          return res.status(400).json({
            ok: false,
            error: "product_id puudub"
          });
        }

        const result = await setCartItemQuantity(uuid, product_id, quantity);

        return res.status(result.status).json(result.data);
      }

      // TOOTE EEMALDAMINE
      // POST /api/cart?action=removeItem
      // body: { uuid, product_id }
      if (action === "removeItem") {
        const uuid = body.uuid;
        const product_id = Number(body.product_id);

        if (!uuid) {
          return res.status(400).json({
            ok: false,
            error: "uuid puudub"
          });
        }

        if (!product_id) {
          return res.status(400).json({
            ok: false,
            error: "product_id puudub"
          });
        }

        const result = await removeCartItem(uuid, product_id);

        return res.status(result.status).json(result.data);
      }

      // TAVALINE TOOTE LISAMINE
      // POST /api/cart
      // body: { uuid?: "...", product_id: 2931504, quantity: 1 }
      const uuid = body.uuid || null;
      const product_id = Number(body.product_id);
      const quantity = Number(body.quantity || 1);

      if (!product_id) {
        return res.status(400).json({
          ok: false,
          error: "product_id puudub"
        });
      }

      let result;

      if (uuid) {
        result = await updateCart(uuid, product_id, quantity);
      } else {
        result = await createCart(product_id, quantity);
      }

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
