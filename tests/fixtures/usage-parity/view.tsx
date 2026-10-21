import request from "request";

// JSX text is not code, but the regex scanner reads it as code.
export const Help = () => <p>call request.get(url) to download</p>;
export const Button = () => <button onClick={() => request.post("/save")}>Save</button>;
