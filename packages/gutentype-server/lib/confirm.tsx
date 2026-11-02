import { siteName } from "@gutentype/content";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * `GET /login/{token}`: one button that POSTs the token back (CONTRACTS § 5). Opening the link signs nobody in, so a
 * mail scanner that prefetches it cannot use it up. A standalone page with no scripts: the browser app does not
 * mount here, and nothing on the page loads from anywhere.
 */
export function renderSignInConfirm(token: string): string {
  const action = `/login/${encodeURIComponent(token)}`;
  return (
    "<!DOCTYPE html>" +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <meta name="referrer" content="no-referrer" />
          <title>{`Sign in · ${siteName}`}</title>
          <style>
            {"body{font-family:system-ui,sans-serif;margin:0;padding:3rem 1rem;background:#fbf8f1;color:#1d2433}" +
              "main{max-width:28rem;margin:0 auto}" +
              "button{font:inherit;font-weight:700;padding:.75rem 1.5rem;border:2px solid #1d2433;" +
              "border-radius:.25rem;background:#1d2433;color:#fbf8f1;cursor:pointer}"}
          </style>
        </head>
        <body>
          <main>
            <h1>{`Sign in to ${siteName}`}</h1>
            <p>Press the button to finish signing in on this device.</p>
            <form method="post" action={action}>
              <button type="submit">Sign in</button>
            </form>
          </main>
        </body>
      </html>,
    )
  );
}
