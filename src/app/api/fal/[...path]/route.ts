import { NextRequest } from "next/server";

const FAL_API_BASE_URL = "https://fal.run";

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const body = await request.text();

    // Get the authorization header from the request
    const authHeader = request.headers.get("authorization");

    // Forward the request to FAL
    const response = await fetch(`${FAL_API_BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/json",
        ...(authHeader && { Authorization: authHeader }),
      },
      body,
    });

    // Get the response data
    const data = await response.text();

    // Return the response with the same status
    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("FAL proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to proxy request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const authHeader = request.headers.get("authorization");

    const response = await fetch(`${FAL_API_BASE_URL}/${path}`, {
      method: "GET",
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("FAL proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to proxy request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Also handle PUT for file uploads
export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const authHeader = request.headers.get("authorization");

    // For file uploads, we need to handle the body as a stream
    const body = await request.blob();

    const response = await fetch(`${FAL_API_BASE_URL}/${path}`, {
      method: "PUT",
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/octet-stream",
        ...(authHeader && { Authorization: authHeader }),
      },
      body,
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("FAL proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to proxy request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
