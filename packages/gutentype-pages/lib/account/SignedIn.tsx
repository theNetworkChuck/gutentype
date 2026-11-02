import { type UserDetails } from "@keybr/pages-shared";
import { useEffect, useRef } from "react";
import * as styles from "./account.module.less";
import { type AccountService, syncMarkKey } from "./signin.ts";

/** Signed in: who you are, sign out, delete the account (ISC-24), and the one Read merge after signing in. */
export function SignedIn({
  user,
  service,
}: {
  readonly user: UserDetails;
  readonly service: AccountService;
}) {
  useFirstSync(user.id, service);
  return (
    <>
      <p>
        Signed in as <strong>{user.email}</strong>.
      </p>
      <p>
        Your settings, lesson statistics and reading progress are kept with your
        account, so they follow you to your other devices.
      </p>
      <p>
        <button
          className={styles.action}
          type="button"
          onClick={() => {
            forget(syncMarkKey(user.id));
            service.goTo("/auth/logout");
          }}
        >
          Sign out
        </button>
      </p>

      <h2 className={styles.heading}>Delete account</h2>
      <p>
        Deleting your account removes it and everything kept with it from our
        server.
      </p>
      <p>
        <button
          className={styles.danger}
          type="button"
          onClick={() => {
            if (
              service.confirm(
                "Delete your account and everything kept with it? This cannot be undone.",
              )
            ) {
              forget(syncMarkKey(user.id));
              service
                .deleteAccount()
                .then(() => {
                  service.goTo("/");
                })
                .catch(() => {
                  window.alert("The account could not be deleted. Try again.");
                });
            }
          }}
        >
          Delete account
        </button>
      </p>
    </>
  );
}

/** Runs `syncReadProgress()` once per sign-in in this browser (CONTRACTS § 2, first sign-in merge). */
function useFirstSync(userId: string, service: AccountService) {
  const started = useRef(false);
  useEffect(() => {
    const key = syncMarkKey(userId);
    if (started.current || remembered(key)) return;
    started.current = true;
    service
      .syncReadProgress()
      .then(() => {
        remember(key);
      })
      .catch(() => {
        started.current = false;
      });
  }, [userId, service]);
}

function remembered(key: string): boolean {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Private mode: the merge simply runs again next time, which is harmless.
  }
}

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}
