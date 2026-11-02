import { GutentypePaths } from "@gutentype/content";
import { useId, useState } from "react";
import { Link } from "react-router";
import * as styles from "./account.module.less";
import {
  type AccountService,
  ageGate,
  consentSentence,
  googleSignInUrl,
  signInBody,
  signInErrorText,
} from "./signin.ts";

type Step =
  | { readonly type: "age"; readonly error: boolean }
  | { readonly type: "under13" }
  | { readonly type: "doors"; readonly birthYear: number };

/**
 * Signing in, in the order the ISA asks for: birth year first (ISC-57), under 13 continues without an account, then
 * the consent sentence (ISC-56) and exactly two doors (ISC-21), both shut until the sentence is accepted (ISC-63).
 */
export function SignInForm({
  service,
  thisYear,
}: {
  readonly service: AccountService;
  readonly thisYear: number;
}) {
  const [step, setStep] = useState<Step>({ type: "age", error: false });
  switch (step.type) {
    case "age":
      return (
        <BirthYearStep
          error={step.error}
          onSubmit={(value) => {
            const gate = ageGate(value, thisYear);
            setStep(
              gate === "ok"
                ? { type: "doors", birthYear: Number(value.trim()) }
                : gate === "under13"
                  ? { type: "under13" }
                  : { type: "age", error: true },
            );
          }}
        />
      );
    case "under13":
      return (
        <>
          <p>
            Accounts are for people 13 and older. You can keep typing without
            one: your progress stays in this browser.
          </p>
          <p>
            <Link className={styles.action} to={GutentypePaths.home}>
              Keep typing
            </Link>
          </p>
        </>
      );
    case "doors":
      return (
        <Doors
          service={service}
          birthYear={step.birthYear}
          thisYear={thisYear}
        />
      );
  }
}

function BirthYearStep({
  error,
  onSubmit,
}: {
  readonly error: boolean;
  readonly onSubmit: (value: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label className={styles.label} htmlFor={id}>
        Birth year
      </label>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="numeric"
        autoComplete="bday-year"
        maxLength={4}
        placeholder="YYYY"
        value={value}
        aria-invalid={error}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      {error && (
        <p className={styles.error} role="alert">
          Enter the four-digit year you were born.
        </p>
      )}
      <button className={styles.action} type="submit">
        Continue
      </button>
    </form>
  );
}

type Send =
  | { readonly type: "normal" }
  | { readonly type: "sending" }
  | { readonly type: "sent" }
  | { readonly type: "error"; readonly message: string };

function Doors({
  service,
  birthYear,
  thisYear,
}: {
  readonly service: AccountService;
  readonly birthYear: number;
  readonly thisYear: number;
}) {
  const consentId = useId();
  const emailId = useId();
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [send, setSend] = useState<Send>({ type: "normal" });
  const canSend = consent && email.trim() !== "";
  return (
    <>
      <p className={styles.consent}>{consentSentence}</p>
      <p className={styles.check}>
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
          }}
        />{" "}
        <label htmlFor={consentId}>I agree</label>
      </p>

      <div className={styles.door}>
        <button
          className={styles.action}
          type="button"
          disabled={!consent}
          onClick={() => {
            if (consent) {
              service.goTo(googleSignInUrl(birthYear, thisYear));
            }
          }}
        >
          Continue with Google
        </button>
      </div>

      <div className={styles.door}>
        {send.type === "sent" ? (
          <>
            <p>
              We sent a sign-in link to <strong>{email.trim()}</strong>. It
              works once and expires in 15 minutes.
            </p>
            <button
              className={styles.action}
              type="button"
              onClick={() => {
                setSend({ type: "normal" });
              }}
            >
              Send another link
            </button>
          </>
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSend || send.type === "sending") return;
              setSend({ type: "sending" });
              service
                .registerEmail(signInBody(email, birthYear, thisYear))
                .then(() => {
                  setSend({ type: "sent" });
                })
                .catch((error: unknown) => {
                  setSend({ type: "error", message: signInErrorText(error) });
                });
            }}
          >
            <label className={styles.label} htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <button
              className={styles.action}
              type="submit"
              disabled={!canSend || send.type === "sending"}
            >
              {send.type === "sending"
                ? "Sending the sign-in link…"
                : "Email me a sign-in link"}
            </button>
            {send.type === "error" && (
              <p className={styles.error} role="alert">
                {send.message}
              </p>
            )}
            <p className={styles.note}>
              The link works once and expires in 15 minutes.
            </p>
          </form>
        )}
      </div>
    </>
  );
}
