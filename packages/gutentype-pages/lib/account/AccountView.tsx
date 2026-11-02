import { syncReadProgress } from "@gutentype/read";
import { usePageData } from "@keybr/pages-shared";
import * as styles from "./account.module.less";
import { SignedIn } from "./SignedIn.tsx";
import {
  type AccountService,
  deleteAccountRequest,
  postSignInBody,
} from "./signin.ts";
import { SignInForm } from "./SignInForm.tsx";

export const accountService: AccountService = {
  registerEmail: postSignInBody,
  goTo: (url) => {
    window.location.assign(url);
  },
  deleteAccount: deleteAccountRequest,
  confirm: (message) => window.confirm(message),
  syncReadProgress,
};

/** `/account`, in place of Keybr's account page and its checkout (ISC-45). */
export function AccountView({
  service = accountService,
  thisYear = new Date().getFullYear(),
}: {
  readonly service?: AccountService;
  readonly thisYear?: number;
}) {
  const { user } = usePageData();
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>Account</h1>
      {user != null ? (
        <SignedIn user={user} service={service} />
      ) : (
        <>
          <p>
            You do not need an account to type. Signing in only carries your
            progress to your other devices.
          </p>
          <SignInForm service={service} thisYear={thisYear} />
        </>
      )}
    </article>
  );
}

export function GutentypeAccountPage() {
  return <AccountView />;
}
