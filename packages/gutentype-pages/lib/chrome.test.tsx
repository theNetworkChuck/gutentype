import { test } from "node:test";
import { gutentypeProps, Pack } from "@gutentype/content";
import { FakeIntlProvider } from "@keybr/intl";
import { PageDataContext } from "@keybr/pages-shared";
import { Settings } from "@keybr/settings";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { equal, isNotNull, isNull } from "rich-assert";
import { GutentypeFooter, GutentypeNav } from "./index.ts";
import { TestProviders } from "./providers.test-helper.tsx";

test("the nav has Learn, Read and the Keybr pages that stay; never multiplayer or high scores", () => {
  const r = render(
    <TestProviders>
      <GutentypeNav currentPath="/" />
    </TestProviders>,
  );
  for (const name of [
    "Learn",
    "Read",
    "Profile",
    "Typing Test",
    "Layouts",
    "Help",
    "Sign in",
  ]) {
    isNotNull(r.queryByRole("link", { name }), name);
  }
  equal(r.getByRole("link", { name: "Learn" }).getAttribute("href"), "/");
  equal(r.getByRole("link", { name: "Read" }).getAttribute("href"), "/read");
  isNull(r.queryByText(/multiplayer/i));
  isNull(r.queryByText(/high scores/i));
  r.unmount();
});

test("the current page is marked with a word-level shape, not color alone", () => {
  const r = render(
    <TestProviders path="/read">
      <GutentypeNav currentPath="/read" />
    </TestProviders>,
  );
  equal(
    r.getByRole("link", { name: "Read" }).getAttribute("aria-current"),
    "page",
  );
  equal(
    r.getByRole("link", { name: "Learn" }).getAttribute("aria-current"),
    null,
  );
  r.unmount();
});

test("the footer carries the translation label and Source, Privacy, Translations, Donate", () => {
  const r = render(
    <TestProviders>
      <GutentypeFooter />
    </TestProviders>,
  );
  isNotNull(r.queryByText("Berean Standard Bible (BSB)"));
  equal(
    r.getByRole("link", { name: "Privacy" }).getAttribute("href"),
    "/privacy",
  );
  equal(
    r.getByRole("link", { name: "Translations" }).getAttribute("href"),
    "/translations",
  );
  equal(
    r.getByRole("link", { name: "Donate" }).getAttribute("href"),
    "/donate",
  );
  equal(
    r
      .getByRole("link", { name: "Source" })
      .getAttribute("href")
      ?.startsWith("https://github.com/theNetworkChuck/gutentype"),
    true,
  );
  r.unmount();
});

test("the footer names the active translation", () => {
  const r = render(
    <TestProviders settings={new Settings().set(gutentypeProps.pack, Pack.KJV)}>
      <GutentypeFooter />
    </TestProviders>,
  );
  isNotNull(r.queryByText(`${Pack.KJV.info.label} (${Pack.KJV.info.short})`));
  r.unmount();
});

test("the footer still renders where no settings exist yet (Keybr's own Template test)", () => {
  const r = render(
    <PageDataContext.Provider
      value={{
        base: "/",
        locale: "en",
        user: null,
        publicUser: { id: null, name: "name", imageUrl: null },
        settings: null,
      }}
    >
      <FakeIntlProvider>
        <MemoryRouter>
          <GutentypeFooter />
        </MemoryRouter>
      </FakeIntlProvider>
    </PageDataContext.Provider>,
  );
  isNotNull(r.queryByText("Berean Standard Bible (BSB)"));
  r.unmount();
});
