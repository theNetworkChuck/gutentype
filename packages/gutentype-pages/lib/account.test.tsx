/*
 * ISC-21 (two doors), ISC-51 (no password field), ISC-56 (the consent sentence first), ISC-57 (form side: birth
 * year first, under 13 continues without an account), ISC-63 (nothing is sent before consent), ISC-24 (the delete
 * control exists), and the one first-sign-in Read sync.
 */
import { test } from "node:test";
import { type UserDetails } from "@keybr/pages-shared";
import {
  act,
  fireEvent,
  render,
  type RenderResult,
} from "@testing-library/react";
import { deepEqual, equal, isNotNull, isNull, isTrue } from "rich-assert";
import { type AccountService, AccountView, consentSentence } from "./index.ts";
import { TestProviders } from "./providers.test-helper.tsx";

function fakeService() {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const service: AccountService = {
    registerEmail: async (body) => {
      calls.push("registerEmail");
      bodies.push(body);
    },
    goTo: (url) => {
      calls.push(`goTo ${url}`);
    },
    deleteAccount: async () => {
      calls.push("deleteAccount");
    },
    confirm: () => true,
    syncReadProgress: async () => {
      calls.push("syncReadProgress");
    },
  };
  return { service, calls, bodies };
}

function renderSignedOut(service: AccountService) {
  return render(
    <TestProviders path="/account">
      <AccountView service={service} thisYear={2026} />
    </TestProviders>,
  );
}

function enterBirthYear(r: RenderResult, year: string) {
  fireEvent.change(r.getByRole("textbox", { name: "Birth year" }), {
    target: { value: year },
  });
  fireEvent.click(r.getByRole("button", { name: "Continue" }));
}

function doors(r: RenderResult) {
  return r
    .queryAllByRole("button")
    .filter((b) => /google|sign-in link/i.test(b.textContent ?? ""));
}

test("birth year comes first, before any door", () => {
  const { service, calls } = fakeService();
  const r = renderSignedOut(service);
  isNotNull(r.queryByRole("textbox", { name: "Birth year" }));
  isNull(r.queryByRole("textbox", { name: "Email" }));
  equal(doors(r).length, 0);
  isNull(r.container.querySelector("input[type=password]"));
  deepEqual(calls, []);
  r.unmount();
});

test("under 13 continues without an account: no form, no door, a way back to typing", () => {
  const { service, calls } = fakeService();
  const r = renderSignedOut(service);
  enterBirthYear(r, "2015");
  equal(r.container.querySelectorAll("input").length, 0);
  equal(doors(r).length, 0);
  equal(r.getByRole("link", { name: "Keep typing" }).getAttribute("href"), "/");
  deepEqual(calls, []);
  r.unmount();
});

test("a year that is not a year is asked again", () => {
  const { service } = fakeService();
  const r = renderSignedOut(service);
  enterBirthYear(r, "20x5");
  isNotNull(r.queryByRole("textbox", { name: "Birth year" }));
  isNotNull(r.queryByText("Enter the four-digit year you were born."));
  r.unmount();
});

test("13 and over: the consent sentence, then exactly two doors, both shut until consent", () => {
  const { service, calls } = fakeService();
  const r = renderSignedOut(service);
  enterBirthYear(r, "1990");
  isNotNull(r.queryByText(consentSentence));
  const [google, email] = doors(r);
  equal(doors(r).length, 2);
  isTrue(/Continue with Google/.test(google.textContent ?? ""));
  isTrue(/sign-in link/.test(email.textContent ?? ""));
  isNull(r.queryByText(/facebook|microsoft/i));
  isNull(r.container.querySelector("input[type=password]"));
  isTrue((google as HTMLButtonElement).disabled);
  isTrue((email as HTMLButtonElement).disabled);
  fireEvent.change(r.getByRole("textbox", { name: "Email" }), {
    target: { value: "person@example.com" },
  });
  fireEvent.click(email);
  fireEvent.click(google);
  deepEqual(calls, [], "nothing leaves the browser before consent");
  r.unmount();
});

test("after consent the email door sends the birth year and the consent", async () => {
  const { service, calls, bodies } = fakeService();
  const r = renderSignedOut(service);
  enterBirthYear(r, "1990");
  fireEvent.click(r.getByRole("checkbox", { name: /I agree/ }));
  fireEvent.change(r.getByRole("textbox", { name: "Email" }), {
    target: { value: "person@example.com" },
  });
  await act(async () => {
    fireEvent.click(doors(r)[1]);
  });
  deepEqual(calls, ["registerEmail"]);
  deepEqual(bodies, [
    { email: "person@example.com", birthYear: 1990, consent: true },
  ]);
  isNotNull(r.queryByText(/We sent a sign-in link to/));
  r.unmount();
});

test("after consent the Google door carries the birth year and the consent", () => {
  const { service, calls } = fakeService();
  const r = renderSignedOut(service);
  enterBirthYear(r, "1990");
  fireEvent.click(r.getByRole("checkbox", { name: /I agree/ }));
  fireEvent.click(doors(r)[0]);
  deepEqual(calls, [
    "goTo /auth/oauth-init/google?birthYear=1990&consent=true",
  ]);
  r.unmount();
});

const user: UserDetails = {
  id: "u1",
  email: "person@example.com",
  name: "Person",
  anonymized: false,
  externalId: [],
  order: null,
  createdAt: "2026-11-02T00:00:00Z",
};

test("signed in: sign out, delete account, and one Read sync per sign-in", async () => {
  localStorage.clear();
  const { service, calls } = fakeService();
  const view = () => (
    <TestProviders user={user} path="/account">
      <AccountView service={service} thisYear={2026} />
    </TestProviders>
  );
  const r = render(view());
  await act(async () => {});
  isNotNull(r.queryByText(/person@example.com/));
  isNotNull(r.queryByRole("button", { name: "Sign out" }));
  isNotNull(r.queryByRole("button", { name: "Delete account" }));
  isNull(r.container.querySelector("input[type=password]"));
  deepEqual(calls, ["syncReadProgress"]);
  r.unmount();

  const again = render(view());
  await act(async () => {});
  deepEqual(calls, ["syncReadProgress"], "not again in the same sign-in");
  await act(async () => {
    fireEvent.click(again.getByRole("button", { name: "Delete account" }));
  });
  deepEqual(calls, ["syncReadProgress", "deleteAccount", "goTo /"]);
  again.unmount();
});

test("signing out clears the sync mark so the next sign-in merges again", async () => {
  localStorage.clear();
  const { service, calls } = fakeService();
  const r = render(
    <TestProviders user={user} path="/account">
      <AccountView service={service} thisYear={2026} />
    </TestProviders>,
  );
  await act(async () => {});
  fireEvent.click(r.getByRole("button", { name: "Sign out" }));
  deepEqual(calls, ["syncReadProgress", "goTo /auth/logout"]);
  equal(localStorage.length, 0);
  r.unmount();
});
