import { createClient } from "./client";

export default createClient;
export { createClient };
export type {
  Client,
  ClientMethod,
  ClientOptions,
  Fetch,
  HttpMethod,
  Middleware,
  MiddlewareRequestContext,
  MiddlewareResponseContext,
  PathsWithMethod,
  RequestOptions,
  RequestParams,
  Result,
} from "./client";
