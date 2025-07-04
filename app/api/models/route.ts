import { getModelsWithAccessFlags } from "@/lib/models"

export async function GET() {
  const models = await getModelsWithAccessFlags()
  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST() {
  const models = await getModelsWithAccessFlags()
  return Response.json({
    message: "Models cache refreshed",
    models,
    timestamp: new Date().toISOString(),
    count: models.length,
  })
}
