import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("http://localhost:8000/health", () =>
    HttpResponse.json({
      status: "ok",
      service: "backend",
      redis: {
        configured: false,
        connected: false,
      },
    }),
  ),
  http.get("http://localhost:8000/api/fixtures", () =>
    HttpResponse.json({
      response: [],
      results: 0,
    }),
  ),
  http.get("http://localhost:8000/api/leagues", () =>
    HttpResponse.json({
      response: [],
      results: 0,
    }),
  ),
  http.get("http://localhost:8000/api/teams", () =>
    HttpResponse.json({
      response: [],
      results: 0,
    }),
  ),
  http.get("http://localhost:8000/api/players", () =>
    HttpResponse.json({
      response: [],
      results: 0,
    }),
  ),
];
