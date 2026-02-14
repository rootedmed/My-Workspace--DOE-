import { captureObservedError } from "@/lib/observability/errorReporter";

export async function register() {}

export async function onRequestError(
  error: Error,
  request: { path?: string; headers?: Record<string, string> }
) {
  captureObservedError(error, {
    source: "server",
    route: request.path,
    requestId: request.headers?.["x-request-id"]
  });
}
