import { request } from "./httpClient";

export const authService = {
  getCaptcha: () => request("/captcha"),
  login: (body: any) =>
    request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  register: (body: any) =>
    request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
