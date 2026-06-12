export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brunotombergdesign.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  return res.status(200).json({
    ok: true,
    message: "Vercel proxy töötab"
  });
}
