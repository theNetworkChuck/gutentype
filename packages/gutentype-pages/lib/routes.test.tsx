/*
 * gutentypeRoutes(Template, Title): Read routes, /translations (ISC-27, ISC-28), /privacy, /donate (ISC-62), and
 * Keybr's switched-off pages answered by a not-found page in the browser (ISC-50, browser side).
 */
import { test } from "node:test";
import { activePack, Pack, translationLabel } from "@gutentype/content";
import { type PageInfo } from "@keybr/pages-shared";
import { useSettings } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { equal, isNotNull, isNull, isTrue } from "rich-assert";
import { gutentypeRoutes } from "./index.ts";
import { TestProviders } from "./providers.test-helper.tsx";

function Template({ children }: { path: string; children: ReactNode }) {
  return <div data-testid="template">{children}</div>;
}

const titles: string[] = [];
function Title({ page }: { page: PageInfo }) {
  titles.push(String(page.title.defaultMessage));
  return null;
}

function PackProbe() {
  const { settings } = useSettings();
  return <output>{`active ${activePack(settings).id}`}</output>;
}

function renderAt(path: string) {
  return render(
    <TestProviders path={path}>
      <Routes>
        {gutentypeRoutes(Template, Title)}
        <Route path="/multiplayer" element={<p>Keybr multiplayer</p>} />
        <Route path="/high-scores" element={<p>Keybr high scores</p>} />
        <Route path="/privacy-policy" element={<p>Keybr privacy policy</p>} />
        <Route path="*" element={<p>Keybr fallback</p>} />
      </Routes>
      <PackProbe />
    </TestProviders>,
  );
}

test("Keybr's switched-off pages render Gutentype's not-found page", () => {
  for (const path of ["/multiplayer", "/high-scores", "/privacy-policy"]) {
    const r = renderAt(path);
    isNotNull(r.queryByText("Page not found."), path);
    isNull(r.queryByText(/^Keybr/), path);
    r.unmount();
  }
});

test("the Read routes render inside the Template", () => {
  for (const path of ["/read", "/read/john", "/read/john/1", "/share"]) {
    const r = renderAt(path);
    isNotNull(r.queryByTestId("template"), path);
    isNull(r.queryByText("Keybr fallback"), path);
    r.unmount();
  }
});

test("/translations lists every pack with its license and source, and switches the pack", () => {
  const r = renderAt("/translations");
  for (const pack of Pack.ALL) {
    isNotNull(r.queryByText(translationLabel(pack)));
    isNotNull(r.queryByText(pack.info.license));
    const source = r.getByRole("link", { name: pack.info.sourceUrl });
    equal(source.getAttribute("href"), pack.info.sourceUrl);
  }
  isNotNull(r.queryByText("active bsb"));
  isNotNull(r.queryByText("In use"));
  fireEvent.click(r.getByRole("button", { name: /Use the King James/ }));
  isNotNull(r.queryByText("active kjv"));
  r.unmount();
});

test("/privacy shows the privacy copy", () => {
  const r = renderAt("/privacy");
  isNotNull(r.queryByRole("heading", { name: "Privacy" }));
  isNotNull(r.queryByRole("heading", { name: "Children" }));
  r.unmount();
});

test("/donate says what is true now and never mentions a surplus", () => {
  const r = renderAt("/donate");
  isNotNull(r.queryByRole("heading", { name: "Donate" }));
  isNotNull(r.queryByText("Donations are not open yet."));
  isTrue(!/surplus|ministr/i.test(r.container.textContent ?? ""));
  r.unmount();
});

test("each Gutentype page sets its title", () => {
  titles.length = 0;
  renderAt("/translations").unmount();
  isTrue(titles.includes("Translations"));
});
