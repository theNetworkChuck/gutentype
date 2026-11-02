// eslint-disable-next-line n/no-extraneous-import -- the "@gutentype/pages" dependency line is the integrator's (CONTRACTS)
import { GutentypeFooter, GutentypeNav } from "@gutentype/pages";
import { PortalContainer, Toaster } from "@keybr/widget";
import { type ReactNode } from "react";
import { ThemeSwitcher } from "./themes/ThemeSwitcher.tsx";

// Gutentype: one layout for everyone (no ad slots, no premium variant), Gutentype's nav and footer, and data-gt
// hooks the Gutentype stylesheet stacks under 40rem (CONTRACTS § 7).
export function Template({
  path,
  children,
}: {
  readonly path: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-gt="layout">
      <main data-gt="main">
        {children}
        <PortalContainer />
        <Toaster />
      </main>
      <nav data-gt="nav">
        <GutentypeNav currentPath={path} extra={<ThemeSwitcher />} />
      </nav>
      <GutentypeFooter />
      <EnvName />
    </div>
  );
}

function EnvName() {
  return process.env.NODE_ENV === "production" ? null : (
    <div
      style={{
        position: "fixed",
        zIndex: "1",
        insetInlineEnd: "0px",
        insetBlockEnd: "0px",
        padding: "5px",
        margin: "5px",
        border: "1px solid red",
        color: "red",
      }}
    >
      {`process.env.NODE_ENV=${process.env.NODE_ENV}`}
    </div>
  );
}
