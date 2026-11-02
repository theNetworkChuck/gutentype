import { GutentypePaths } from "@gutentype/content";
import { Header, Para } from "@keybr/widget";
import { type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { readCopy } from "../copy.ts";
import * as styles from "../Read.module.less";
import { parseShareCard } from "../share/card.ts";
import { ShareCardView } from "../share/ShareCardView.tsx";
import { Page } from "./parts.tsx";

/** `/share?pack&book&wpm&acc&date`: someone's finished-book card, drawn from the URL's own fields (ISC-18). */
export function SharePage(): ReactNode {
  const [params] = useSearchParams();
  const card = parseShareCard(params);
  return (
    <Page>
      <Header level={1}>{readCopy.shareTitle}</Header>
      {card != null ? (
        <ShareCardView card={card} />
      ) : (
        <Para>{readCopy.shareInvalid}</Para>
      )}
      <Link className={styles.resume} to={GutentypePaths.read}>
        {readCopy.typeABook}
      </Link>
    </Page>
  );
}
