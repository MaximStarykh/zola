import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()
    return NextResponse.json({ hasUserKey: false, provider })
  } catch (error) {
    console.error("Error checking provider keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
