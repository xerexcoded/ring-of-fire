export function GET() {
  return Response.json({ status: "ok", service: "restless-pacific-web" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
