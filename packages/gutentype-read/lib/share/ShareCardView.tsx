import { Button } from "@keybr/widget";
import { type ReactNode, useState } from "react";
import { readCopy } from "../copy.ts";
import * as styles from "../Read.module.less";
import { type ShareCard, shareCardText, shareUrl } from "./card.ts";
import { downloadShareCard } from "./draw.ts";

type Status = "idle" | "busy" | "copied" | "copy-failed" | "png-failed";

/** The finished-book card: shown on the page, saved as a PNG drawn here, shared as a URL of its own fields. */
export function ShareCardView({
  card,
}: {
  readonly card: ShareCard;
}): ReactNode {
  const [status, setStatus] = useState<Status>("idle");
  const text = shareCardText(card);
  if (text == null) return null;
  const url = shareUrl(card);
  const handleDownload = () => {
    setStatus("busy");
    downloadShareCard(card).then(
      () => setStatus("idle"),
      () => setStatus("png-failed"),
    );
  };
  const handleCopy = () => {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard == null) {
      setStatus("copy-failed");
      return;
    }
    clipboard.writeText(url).then(
      () => setStatus("copied"),
      () => setStatus("copy-failed"),
    );
  };
  return (
    <section
      className={styles.card}
      aria-label={readCopy.shareTitle}
      data-gt="share-card"
    >
      <div className={styles.cardFace}>
        <div className={styles.cardSite}>
          <span>{text.site}</span>
          <span aria-hidden="true">✓</span>
        </div>
        <div className={styles.cardHeading}>{text.heading}</div>
        <div className={styles.cardBook}>{text.book}</div>
        <div className={styles.cardTranslation}>{text.translation}</div>
        <div className={styles.cardStats}>
          {text.speed} · {text.accuracy}
        </div>
        <div className={styles.cardDate}>{text.date}</div>
      </div>
      <div className={styles.actions}>
        <Button
          label={
            status === "busy" ? readCopy.downloading : readCopy.downloadPng
          }
          onClick={handleDownload}
        />
        <Button
          label={
            status === "copied" ? `✓ ${readCopy.linkCopied}` : readCopy.copyLink
          }
          onClick={handleCopy}
        />
        {status === "png-failed" && (
          <span role="status">{readCopy.downloadFailed}</span>
        )}
        {status === "copy-failed" && (
          <span role="status">{readCopy.copyFailed}</span>
        )}
      </div>
      <label className={styles.shareField}>
        <span>{readCopy.shareLink}</span>
        <input
          className={styles.shareInput}
          type="url"
          readOnly={true}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p className={styles.note}>{readCopy.shareLinkNote}</p>
    </section>
  );
}
