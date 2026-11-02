import { FakeIntlProvider } from "@keybr/intl";
import { type PageData, PageDataContext } from "@keybr/pages-shared";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { type ReactNode } from "react";
import { MemoryRouter } from "react-router";

/** Test-only wrapper: page data, intl, settings and a router, as the browser app provides them. */
export function TestProviders({
  user = null,
  settings = new Settings(),
  path = "/",
  children,
}: {
  readonly user?: PageData["user"];
  readonly settings?: Settings;
  readonly path?: string;
  readonly children: ReactNode;
}) {
  return (
    <PageDataContext.Provider
      value={{
        base: "/",
        locale: "en",
        user,
        publicUser:
          user != null
            ? { id: user.id, name: user.name, imageUrl: null, premium: false }
            : { id: null, name: "Anonymous", imageUrl: null },
        settings: null,
      }}
    >
      <FakeIntlProvider>
        <FakeSettingsContext initialSettings={settings}>
          <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
        </FakeSettingsContext>
      </FakeIntlProvider>
    </PageDataContext.Provider>
  );
}
