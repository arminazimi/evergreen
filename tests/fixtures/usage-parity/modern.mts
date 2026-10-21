import request from "request";
import * as moment from "moment";

// Forms only the parser sees: multi-line calls, aliases, re-exports, and optional chaining.
export { get } from "request";

const post = request.post;
post("https://example.com");

request
  .get(
    "https://example.com",
  );

request?.get("https://example.com");
export const stamp = moment.utc();
