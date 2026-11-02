import { GutentypePaths, siteName } from "@gutentype/content";
import { type PageInfo, Pages, usePageData } from "@keybr/pages-shared";
import { type ReactNode } from "react";
import { useIntl } from "react-intl";
import { NavLink } from "react-router";
import * as styles from "./chrome.module.less";

/**
 * The Gutentype nav, in place of Keybr's NavMenu: Learn, Read, then the Keybr pages that stay (profile, typing test,
 * layouts, help) and the account link. Multiplayer and high scores are switched off and never linked (ISC-50).
 * The current page is bold, underlined and marked `aria-current`, never shown by color alone (ISC-5).
 */
export function GutentypeNav({
  currentPath: _currentPath,
  extra,
}: {
  readonly currentPath: string;
  /** Rendered last, e.g. Keybr's theme switcher, which lives in keybr-pages-browser. */
  readonly extra?: ReactNode;
}) {
  const { publicUser } = usePageData();
  return (
    <div className={styles.nav}>
      <NavLink className={styles.brand} to={GutentypePaths.home} end={true}>
        {siteName}
      </NavLink>
      <ul className={styles.list}>
        <Item to={GutentypePaths.home} end={true}>
          Learn
        </Item>
        <Item to={GutentypePaths.read}>Read</Item>
        <KeybrItem page={Pages.typingTest} />
        <KeybrItem page={Pages.layouts} />
        <KeybrItem page={Pages.profile} />
        <KeybrItem page={Pages.help} />
        <Item to={GutentypePaths.account}>
          {publicUser.id != null ? publicUser.name : "Sign in"}
        </Item>
      </ul>
      {extra != null && <div className={styles.extra}>{extra}</div>}
    </div>
  );
}

function Item({
  to,
  end,
  children,
}: {
  readonly to: string;
  readonly end?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li>
      <NavLink className={styles.link} to={to} end={end}>
        {children}
      </NavLink>
    </li>
  );
}

function KeybrItem({ page }: { readonly page: PageInfo }) {
  const { formatMessage } = useIntl();
  return <Item to={page.path}>{formatMessage(page.link.label)}</Item>;
}
